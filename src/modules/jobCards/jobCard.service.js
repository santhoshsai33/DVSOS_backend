const prisma = require('../../config/db');
const {
  STATUS_MODULE_CODES,
  statusModuleFilter,
  resolveStatusById,
  resolveStatusFromCodes,
  resolveStatusIdFromCodes
} = require('../../common/utils/status.util');
const { normalizeVehicleNumber } = require('../../utils/normalizeVehicleNumber');

const normalizeText = (value) => String(value || '').trim().toLowerCase().replace(/[_\s]+/g, '-');

const isMechanicalCategory = (category) => {
  const normalized = normalizeText(category && (category.slug || category.name));
  return ['mechanical', 'mechanic', 'mechnanic', 'floor'].includes(normalized);
};

const createHttpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const toTrimmedString = (value) => {
  if (value === undefined || value === null) return undefined;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
};

const toOptionalNumber = (value) => {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const JOB_CARD_SERVICE_PENDING_STATUS_CODES = ['PENDING'];
const DEPARTMENT_ORDER = ['mechanical', 'body-shop', 'water-wash'];
const DEPARTMENT_ALIASES = {
  mechanical: ['mechanical', 'mechanic', 'mechnanic', 'floor'],
  'body-shop': ['body-shop', 'body_shop', 'body shop', 'bodyshop', 'paint', 'denting'],
  'water-wash': ['water-wash', 'water_wash', 'water wash', 'wash']
};
const ASSIGNMENT_STATUS_CODES = {
  mechanical: {
    inProgress: ['MECHANICAL_IN_PROGRESS'],
    completed: ['MECHANICAL_COMPLETED']
  },
  'body-shop': {
    inProgress: ['BODY_SHOP_IN_PROGRESS'],
    completed: ['BODY_SHOP_COMPLETED']
  },
  'water-wash': {
    inProgress: ['WATER_WASH_IN_PROGRESS'],
    completed: ['WATER_WASH_COMPLETED']
  }
};
const READY_FOR_DELIVERY_STATUS_CODES = ['READY_FOR_DELIVERY'];

const parseExpectedDeliveryAt = (value) => {
  const trimmed = toTrimmedString(value);
  if (!trimmed) return undefined;

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    throw createHttpError(400, 'Expected delivery date must be valid');
  }

  return date;
};

const buildJobCardIdentifierWhere = (identifier) => {
  const parsedId = Number(identifier);
  const isNumericId = Number.isInteger(parsedId) && parsedId > 0;

  return isNumericId
    ? { id: parsedId }
    : { slug: String(identifier || '').trim() };
};

const normalizeServicePayload = (services = []) => {
  if (!Array.isArray(services)) return [];

  const itemMap = new Map();

  services.forEach((item) => {
    const rawServiceItemId = typeof item === 'object' ? (item.serviceItemId ?? item.id) : item;
    const parsedServiceItemId = Number(rawServiceItemId);
    const serviceName = typeof item === 'object' ? toTrimmedString(item.name || item.serviceName) : undefined;
    const price = typeof item === 'object' ? toOptionalNumber(item.price) : undefined;
    const quantity = Math.max(1, Number(typeof item === 'object' && item.quantity !== undefined ? item.quantity : 1) || 1);
    const key = Number.isInteger(parsedServiceItemId) && parsedServiceItemId > 0
      ? `id:${parsedServiceItemId}`
      : `name:${String(serviceName || '').toLowerCase()}`;

    if (!key.endsWith(':')) {
      const existing = itemMap.get(key);
      itemMap.set(key, {
        serviceItemId: Number.isInteger(parsedServiceItemId) && parsedServiceItemId > 0 ? parsedServiceItemId : null,
        serviceName,
        price,
        quantity: (existing ? existing.quantity : 0) + quantity
      });
    }
  });

  return Array.from(itemMap.values());
};

const resolveServiceSelections = async (tx, payloadServices) => {
  const normalizedServices = normalizeServicePayload(payloadServices);
  if (normalizedServices.length === 0) return [];

  const serviceItemIds = normalizedServices
    .map((item) => item.serviceItemId)
    .filter(Boolean);
  const serviceNames = normalizedServices
    .filter((item) => !item.serviceItemId && item.serviceName)
    .map((item) => item.serviceName);

  const serviceItems = await tx.serviceItem.findMany({
    where: {
      isActive: true,
      category: {
        isActive: true
      },
      OR: [
        ...(serviceItemIds.length > 0 ? [{ id: { in: serviceItemIds } }] : []),
        ...(serviceNames.length > 0 ? [{ name: { in: serviceNames } }] : [])
      ]
    },
    select: {
      id: true,
      name: true,
      defaultPrice: true
    }
  });

  const byId = new Map(serviceItems.map((item) => [item.id, item]));
  const byName = new Map(serviceItems.map((item) => [String(item.name).toLowerCase(), item]));

  return normalizedServices.map((selection) => {
    const serviceItem = selection.serviceItemId
      ? byId.get(selection.serviceItemId)
      : byName.get(String(selection.serviceName || '').toLowerCase());

    if (!serviceItem) {
      throw createHttpError(400, 'One or more selected services are invalid or inactive');
    }

    return {
      serviceItemId: serviceItem.id,
      serviceName: serviceItem.name,
      price: selection.price !== undefined ? selection.price : Number(serviceItem.defaultPrice),
      quantity: selection.quantity
    };
  });
};

const normalizeDepartment = (value) => {
  const normalizedValue = normalizeText(value);

  return DEPARTMENT_ORDER.find((department) => {
    return DEPARTMENT_ALIASES[department].some((alias) => normalizeText(alias) === normalizedValue);
  });
};

const ROLE_ALIASES = {
  body_shop: 'body_shop_supervisor',
  bodyshop: 'body_shop_supervisor',
  bodyshop_supervisor: 'body_shop_supervisor',
  floor: 'floor_supervisor',
  mechanical_supervisor: 'floor_supervisor',
  water_wash: 'water_wash_team',
  water_wash_supervisor: 'water_wash_team',
  wash: 'water_wash_team'
};

const normalizeRoleSlug = (roleSlug) => {
  const normalized = String(roleSlug || '').trim().toLowerCase().replace(/[-\s]+/g, '_');
  return ROLE_ALIASES[normalized] || normalized;
};

const PRIVILEGED_SERVICE_STATUS_ROLES = new Set(['admin', 'super_admin', 'manager', 'managing_director']);

const ROLE_DEPARTMENTS = {
  floor_supervisor: 'mechanical',
  mechanical: 'mechanical',
  mechanic: 'mechanical',
  body_shop_supervisor: 'body-shop',
  water_wash_supervisor: 'water-wash',
  water_wash_team: 'water-wash',
  water_wash: 'water-wash'
};
const ROLE_JOB_CARD_DEPARTMENTS = {
  body_shop_supervisor: 'body-shop',
  water_wash_supervisor: 'water-wash',
  water_wash_team: 'water-wash',
  water_wash: 'water-wash'
};

const getUserServiceStatusDepartment = (user) => {
  const roleSlug = normalizeRoleSlug(user && user.roleSlug);

  if (PRIVILEGED_SERVICE_STATUS_ROLES.has(roleSlug)) {
    return 'all';
  }

  return ROLE_DEPARTMENTS[roleSlug] || null;
};

const getServiceDepartment = (service) => {
  const category = service && service.serviceItem && service.serviceItem.category;
  return normalizeDepartment(category && (category.slug || category.name));
};

const getQueryDepartment = (query, user) => {
  const requestedDepartment = normalizeDepartment(query.department || query.category);

  if (requestedDepartment) {
    return requestedDepartment;
  }

  return ROLE_JOB_CARD_DEPARTMENTS[normalizeRoleSlug(user && user.roleSlug)] || null;
};

const getStatusCode = (status) => String((status && status.statusCode) || '').trim().toUpperCase();

const isCompletedStatusCode = (statusCode) => {
  const code = String(statusCode || '').trim().toUpperCase();
  return code === 'COMPLETED' || code.endsWith('_COMPLETED');
};

const isInProgressStatusCode = (statusCode) => {
  const code = String(statusCode || '').trim().toUpperCase();
  return code === 'IN_PROGRESS' || code.endsWith('_IN_PROGRESS');
};

const getDepartmentServices = (jobCard, department) => {
  return (jobCard.services || []).filter((service) => getServiceDepartment(service) === department);
};

const isJobCardServiceCompleted = (service) => {
  if (isCompletedStatusCode(getStatusCode(service.serviceStatus))) {
    return true;
  }

  const assignments = service.workAssignments || [];
  return assignments.length > 0 && assignments.every((assignment) => {
    return assignment.completedAt || isCompletedStatusCode(getStatusCode(assignment.status));
  });
};

const isJobCardServiceInProgress = (service) => {
  if (isInProgressStatusCode(getStatusCode(service.serviceStatus))) {
    return true;
  }

  const assignments = service.workAssignments || [];
  return assignments.some((assignment) => {
    return assignment.startedAt || isInProgressStatusCode(getStatusCode(assignment.status));
  });
};

const areAllJobCardServicesCompleted = (jobCard) => {
  const services = jobCard.services || [];
  return services.length > 0 && services.every(isJobCardServiceCompleted);
};

const arePreviousDepartmentsCompleted = (jobCard, department) => {
  const departmentIndex = DEPARTMENT_ORDER.indexOf(department);
  const previousDepartments = DEPARTMENT_ORDER.slice(0, departmentIndex);

  return previousDepartments.every((previousDepartment) => {
    const services = getDepartmentServices(jobCard, previousDepartment);
    return services.length === 0 || services.every(isJobCardServiceCompleted);
  });
};

const validateServiceStatusUpdateAccess = (jobCard, service, user) => {
  const allowedDepartment = getUserServiceStatusDepartment(user);

  if (!allowedDepartment) {
    throw createHttpError(403, 'You are not allowed to update service status');
  }

  if (allowedDepartment === 'all') {
    return;
  }

  const serviceDepartment = getServiceDepartment(service);

  if (!serviceDepartment || serviceDepartment !== allowedDepartment) {
    throw createHttpError(403, 'You can update only your department service status');
  }

  if (!arePreviousDepartmentsCompleted(jobCard, serviceDepartment)) {
    throw createHttpError(400, 'Previous service stage must be completed before updating this service status');
  }

  if (isJobCardServiceCompleted(service)) {
    throw createHttpError(400, 'Completed service status cannot be changed');
  }
};

const resolveRequiredStatus = async (tx, moduleCode, statusCodes, label) => {
  const status = await resolveStatusFromCodes(tx, moduleCode, statusCodes);

  if (!status) {
    throw createHttpError(500, `${label} status is not configured`);
  }

  return status;
};

const syncAssignmentsForServiceStatus = async (tx, service, serviceStatus, user) => {
  const serviceStatusCode = getStatusCode(serviceStatus);
  const shouldStart = isInProgressStatusCode(serviceStatusCode);
  const shouldComplete = isCompletedStatusCode(serviceStatusCode);

  if (!shouldStart && !shouldComplete) {
    return;
  }

  const assignments = service.workAssignments || [];
  if (assignments.length === 0) {
    throw createHttpError(400, 'Service must be assigned before work status can be updated');
  }

  const department = getServiceDepartment(service);
  if (!department) {
    throw createHttpError(400, 'Service category is not supported for work status update');
  }

  const assignmentStatus = await resolveRequiredStatus(
    tx,
    STATUS_MODULE_CODES.WORK_ASSIGNMENT,
    shouldComplete ? ASSIGNMENT_STATUS_CODES[department].completed : ASSIGNMENT_STATUS_CODES[department].inProgress,
    `${department} assignment ${shouldComplete ? 'completed' : 'in progress'}`
  );
  const now = new Date();

  for (const assignment of assignments) {
    await tx.workAssignment.update({
      where: { id: assignment.id },
      data: {
        statusId: assignmentStatus.id,
        startedAt: assignment.startedAt || now,
        ...(shouldComplete ? { completedAt: assignment.completedAt || now } : {}),
        modifiedById: user && user.userId ? user.userId : null
      }
    });
  }
};

const deriveJobCardStatus = async (tx, jobCard) => {
  if (areAllJobCardServicesCompleted(jobCard)) {
    return resolveRequiredStatus(
      tx,
      STATUS_MODULE_CODES.JOB_CARD_STATUS,
      READY_FOR_DELIVERY_STATUS_CODES,
      'Ready for delivery job card'
    );
  }

  let lastCompletedDepartment = null;

  for (const department of DEPARTMENT_ORDER) {
    const services = getDepartmentServices(jobCard, department);
    if (services.length === 0) {
      continue;
    }

    if (services.every(isJobCardServiceCompleted)) {
      lastCompletedDepartment = department;
      continue;
    }

    if (services.some((service) => isJobCardServiceInProgress(service) || isJobCardServiceCompleted(service))) {
      return resolveRequiredStatus(
        tx,
        STATUS_MODULE_CODES.JOB_CARD_STATUS,
        ASSIGNMENT_STATUS_CODES[department].inProgress,
        `${department} job card in progress`
      );
    }

    break;
  }

  if (lastCompletedDepartment) {
    return resolveRequiredStatus(
      tx,
      STATUS_MODULE_CODES.JOB_CARD_STATUS,
      ASSIGNMENT_STATUS_CODES[lastCompletedDepartment].completed,
      `${lastCompletedDepartment} job card completed`
    );
  }

  return null;
};

const toAssignmentSummary = (assignment) => ({
  id: assignment.id,
  jobCardId: assignment.jobCardId,
  jobCardServiceId: assignment.jobCardServiceId,
  assignedUserId: assignment.assignedUserId,
  assignedAt: assignment.assignedAt,
  startedAt: assignment.startedAt,
  completedAt: assignment.completedAt,
  status: assignment.status
    ? {
      id: assignment.status.id,
      statusCode: assignment.status.statusCode,
      statusName: assignment.status.statusName
    }
    : null,
  assignedUser: assignment.assignedUser
    ? {
      id: assignment.assignedUser.id,
      fullName: assignment.assignedUser.fullName,
      employeeCode: assignment.assignedUser.employeeCode,
      mobileNo: assignment.assignedUser.mobileNo
    }
    : null,
  service: assignment.jobCardService
    ? {
      id: assignment.jobCardService.id,
      serviceName: assignment.jobCardService.serviceName,
      category: assignment.jobCardService.serviceItem && assignment.jobCardService.serviceItem.category
        ? {
          id: assignment.jobCardService.serviceItem.category.id,
          name: assignment.jobCardService.serviceItem.category.name,
          slug: assignment.jobCardService.serviceItem.category.slug
        }
        : null
    }
    : null
});

const toJobCardListResponse = (jobCard, department) => {
  const activeAssignments = (jobCard.workAssignments || []).map(toAssignmentSummary);
  const departmentAssignments = department
    ? activeAssignments.filter((assignment) => {
      return normalizeDepartment(assignment.service && assignment.service.category && (assignment.service.category.slug || assignment.service.category.name)) === department;
    })
    : activeAssignments.filter((assignment) => {
      return isMechanicalCategory(assignment.service && assignment.service.category);
  });
  const assignedMechanics = Array.from(
    new Map(
      departmentAssignments
        .filter((assignment) => assignment.assignedUser)
        .map((assignment) => [assignment.assignedUser.id, assignment.assignedUser])
    ).values()
  );
  const assignedMechanic = assignedMechanics[0] || null;

  return {
    ...jobCard,
    workAssignments: activeAssignments,
    activeAssignments,
    assignedMechanic,
    assignedMechanics,
    technician: assignedMechanics.length > 0 ? assignedMechanics.map((mechanic) => mechanic.fullName).join(', ') : null,
    technicianId: assignedMechanic ? assignedMechanic.id : null,
    technicianEmployeeCode: assignedMechanic ? assignedMechanic.employeeCode : null
  };
};

const listJobCards = async (query, user) => {
  const page = parseInt(query.page, 10) || 1;
  const limit = parseInt(query.limit, 10) || 10;
  const skip = (page - 1) * limit;
  const department = getQueryDepartment(query, user);

  const where = {};

  const locationId = user?.locationId || query.locationId;
  if (locationId) {
    where.locationId = Number(locationId);
  }

  if (query.search) {
    where.OR = [
      { jobCardNo: { contains: query.search } },
      { vehicle: { registrationNo: { contains: query.search } } },
      { customer: { fullName: { contains: query.search } } },
      { customer: { mobileNo: { contains: query.search } } }
    ];
  }

  if (query.status) {
    where.currentStatus = {
      is: {
        statusCode: String(query.status).trim().toUpperCase(),
        ...statusModuleFilter(STATUS_MODULE_CODES.JOB_CARD_STATUS)
      }
    };
  }

  if (department) {
    where.services = {
      some: {
        serviceItem: {
          category: {
            slug: department
          }
        }
      }
    };
  }

  const [jobCards, total] = await Promise.all([
    prisma.jobCard.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: {
          select: { id: true, fullName: true, mobileNo: true }
        },
        vehicle: {
          select: { id: true, registrationNo: true }
        },
        currentStatus: {
          select: { id: true, statusCode: true, statusName: true }
        },
        location: {
          select: { id: true, locationName: true, locationCode: true }
        },
        workAssignments: {
          where: {
            completedAt: null
          },
          include: {
            assignedUser: {
              select: {
                id: true,
                fullName: true,
                employeeCode: true,
                mobileNo: true
              }
            },
            status: {
              select: {
                id: true,
                statusCode: true,
                statusName: true
              }
            },
            jobCardService: {
              select: {
                id: true,
                serviceName: true,
                serviceItem: {
                  select: {
                    category: {
                      select: {
                        id: true,
                        name: true,
                        slug: true
                      }
                    }
                  }
                }
              }
            }
          },
          orderBy: {
            assignedAt: 'desc'
          }
        }
      }
    }),
    prisma.jobCard.count({ where })
  ]);

  return {
    jobCards: jobCards.map((jobCard) => toJobCardListResponse(jobCard, department)),
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  };
};

const getJobCardById = async (id, user) => {
  const jobCard = await prisma.jobCard.findFirst({
    where: {
      ...buildJobCardIdentifierWhere(id),
      ...(user && user.locationId ? { locationId: Number(user.locationId) } : {})
    },
    include: {
      customer: {
        select: { id: true, fullName: true, mobileNo: true, emailId: true, address: true }
      },
      vehicle: {
        select: {
          id: true,
          registrationNo: true,
          model: true,
          variant: true,
          fuelType: true,
          vehicleColor: true,
          brand: {
            select: { id: true, name: true }
          }
        }
      },
      currentStatus: {
        select: { id: true, statusCode: true, statusName: true }
      },
      location: {
        select: { id: true, locationName: true, locationCode: true }
      },
      gateEntry: {
        select: { id: true, entryType: true, gateEntryNo: true }
      },
      services: {
        include: {
          serviceItem: {
            include: {
              category: true
            }
          },
          serviceStatus: true
        }
      },
      workAssignments: {
        include: {
          assignedUser: {
            select: { id: true, fullName: true, employeeCode: true, mobileNo: true }
          },
          status: true,
          jobCardService: {
            select: {
              id: true,
              serviceName: true,
              serviceItem: {
                select: {
                  category: true
                }
              }
            }
          }
        }
      }
    }
  });

  if (!jobCard) {
    throw new Error('Job Card not found');
  }

  return jobCard;
};

const listJobCardStatuses = async () => {
  return prisma.statusMaster.findMany({
    where: {
      isActive: true,
      ...statusModuleFilter(STATUS_MODULE_CODES.JOB_CARD_STATUS)
    },
    orderBy: [
      { sortOrder: 'asc' },
      { statusName: 'asc' }
    ],
    select: {
      id: true,
      statusCode: true,
      statusName: true,
      slug: true,
      sortOrder: true,
      isFinal: true
    }
  });
};

const listJobCardServiceStatuses = async () => {
  return prisma.statusMaster.findMany({
    where: {
      isActive: true,
      ...statusModuleFilter(STATUS_MODULE_CODES.JOB_CARD_SERVICE)
    },
    orderBy: [
      { sortOrder: 'asc' },
      { statusName: 'asc' }
    ],
    select: {
      id: true,
      statusCode: true,
      statusName: true,
      slug: true,
      sortOrder: true,
      isFinal: true
    }
  });
};

const updateJobCard = async (id, payload, user) => {
  const identifierWhere = buildJobCardIdentifierWhere(id);

  if (!identifierWhere.id && !identifierWhere.slug) {
    throw createHttpError(400, 'Valid job card id is required');
  }

  const existingJobCard = await prisma.jobCard.findFirst({
    where: {
      ...identifierWhere,
      ...(user && user.locationId ? { locationId: Number(user.locationId) } : {})
    },
    include: {
      customer: true,
      vehicle: true,
      currentStatus: {
        select: { id: true, statusCode: true, statusName: true }
      },
      services: {
        include: {
          workAssignments: {
            include: {
              status: true
            }
          },
          serviceItem: {
            include: {
              category: true
            }
          },
          serviceStatus: true
        }
      }
    }
  });

  if (!existingJobCard) {
    throw createHttpError(404, 'Job Card not found');
  }

  const jobCardId = existingJobCard.id;

  const customerName = toTrimmedString(payload.ownerName || payload.customerName || payload.customerInfo?.fullName);
  const customerMobile = toTrimmedString(payload.ownerMobile || payload.mobile || payload.customerInfo?.mobileNo);
  const vehicleNumber = toTrimmedString(payload.vehicleNumber || payload.registrationNumber || payload.vehicleInfo?.registrationNumber);
  const vehicleModel = toTrimmedString(payload.makeModel || payload.vehicleModel || payload.vehicleInfo?.model);
  const notes = toTrimmedString(payload.notes || payload.customerComplaint);
  const additionalNotes = toTrimmedString(payload.additionalNotes);
  const expectedDeliveryAt = parseExpectedDeliveryAt(payload.deliveryDate || payload.expectedDeliveryAt);
  const selectedServices = await prisma.$transaction(async (tx) => {
    return resolveServiceSelections(tx, payload.serviceItems || payload.services || []);
  });
  const serviceStatusUpdates = Array.isArray(payload.serviceStatuses)
    ? payload.serviceStatuses
      .map((item) => ({
        jobCardServiceId: Number(item.jobCardServiceId || item.id),
        statusId: Number(item.statusId || item.serviceStatusId)
      }))
      .filter((item) => Number.isInteger(item.jobCardServiceId) && item.jobCardServiceId > 0 && Number.isInteger(item.statusId) && item.statusId > 0)
    : [];

  return prisma.$transaction(async (tx) => {
    if (customerName !== undefined || customerMobile !== undefined) {
      await tx.customer.update({
        where: { id: existingJobCard.customerId },
        data: {
          ...(customerName !== undefined ? { fullName: customerName } : {}),
          ...(customerMobile !== undefined ? { mobileNo: customerMobile } : {}),
          modifiedById: user && user.userId ? user.userId : null
        }
      });
    }

    if (vehicleNumber !== undefined || vehicleModel !== undefined) {
      const vehicleData = {
        ...(vehicleModel !== undefined ? { model: vehicleModel } : {}),
        modifiedById: user && user.userId ? user.userId : null
      };

      if (vehicleNumber !== undefined) {
        const normalizedVehicleNumber = normalizeVehicleNumber(vehicleNumber);
        const duplicateVehicle = await tx.vehicle.findFirst({
          where: {
            registrationNo: normalizedVehicleNumber,
            id: { not: existingJobCard.vehicleId }
          },
          select: { id: true }
        });

        if (duplicateVehicle) {
          throw createHttpError(409, 'Vehicle number already exists for another vehicle');
        }

        vehicleData.registrationNo = normalizedVehicleNumber;
      }

      await tx.vehicle.update({
        where: { id: existingJobCard.vehicleId },
        data: vehicleData
      });
    }

    if (selectedServices.length > 0) {
      const pendingServiceStatusId = await resolveStatusIdFromCodes(
        tx,
        STATUS_MODULE_CODES.JOB_CARD_SERVICE,
        JOB_CARD_SERVICE_PENDING_STATUS_CODES
      );
      const selectedIds = new Set(selectedServices.map((service) => service.serviceItemId));
      const existingByServiceItemId = new Map(
        existingJobCard.services.map((service) => [service.serviceItemId, service])
      );

      for (const selectedService of selectedServices) {
        const existingService = existingByServiceItemId.get(selectedService.serviceItemId);
        if (existingService) {
          await tx.jobCardService.update({
            where: { id: existingService.id },
            data: {
              serviceName: selectedService.serviceName,
              price: selectedService.price,
              quantity: selectedService.quantity,
              modifiedById: user && user.userId ? user.userId : null
            }
          });
        } else {
          await tx.jobCardService.create({
            data: {
              jobCardId,
              serviceItemId: selectedService.serviceItemId,
              serviceName: selectedService.serviceName,
              price: selectedService.price,
              quantity: selectedService.quantity,
              serviceStatusId: pendingServiceStatusId,
              isAdditional: false,
              createdById: user && user.userId ? user.userId : null
            }
          });
        }
      }

      const removableServiceIds = existingJobCard.services
        .filter((service) => !selectedIds.has(service.serviceItemId) && service.workAssignments.length === 0)
        .map((service) => service.id);

      if (removableServiceIds.length > 0) {
        await tx.jobCardService.deleteMany({
          where: {
            id: { in: removableServiceIds }
          }
        });
      }
    }

    if (serviceStatusUpdates.length > 0) {
      const existingServicesById = new Map(existingJobCard.services.map((service) => [service.id, service]));

      for (const item of serviceStatusUpdates) {
        const existingService = existingServicesById.get(item.jobCardServiceId);
        if (!existingService) {
          throw createHttpError(400, 'One or more selected services are invalid for this job card');
        }

        validateServiceStatusUpdateAccess(existingJobCard, existingService, user);

        const serviceStatus = await resolveStatusById(tx, STATUS_MODULE_CODES.JOB_CARD_SERVICE, item.statusId);

        if (!serviceStatus) {
          throw createHttpError(400, 'Invalid job card service status');
        }

        await syncAssignmentsForServiceStatus(tx, existingService, serviceStatus, user);

        await tx.jobCardService.update({
          where: { id: item.jobCardServiceId },
          data: {
            serviceStatusId: serviceStatus.id,
            modifiedById: user && user.userId ? user.userId : null
          }
        });
      }
    }

    const latestJobCardForStatus = await tx.jobCard.findUnique({
      where: { id: jobCardId },
      select: {
        id: true,
        services: {
          include: {
            serviceStatus: true,
            serviceItem: {
              include: {
                category: true
              }
            },
            workAssignments: {
              include: {
                status: true
              }
            }
          }
        }
      }
    });
    const nextStatus = latestJobCardForStatus ? await deriveJobCardStatus(tx, latestJobCardForStatus) : null;

    const servicesAfterUpdate = await tx.jobCardService.findMany({
      where: { jobCardId },
      select: {
        price: true,
        quantity: true
      }
    });
    const serviceSubtotal = servicesAfterUpdate.reduce((sum, service) => {
      return sum + (Number(service.price) * service.quantity);
    }, 0);
    const taxRate = toOptionalNumber(payload.billing?.taxRate);
    const taxAmount = toOptionalNumber(payload.billing?.taxAmount);
    const discountAmount = toOptionalNumber(payload.billing?.discountAmount) || 0;
    const finalAmount = toOptionalNumber(payload.billing?.finalAmount ?? payload.estimatedCost) ?? (serviceSubtotal + (taxAmount || 0) - discountAmount);
    const shouldUpdateFinancials = selectedServices.length > 0 || payload.billing !== undefined || payload.estimatedCost !== undefined;

    await tx.jobCard.update({
      where: { id: jobCardId },
      data: {
        ...(expectedDeliveryAt !== undefined ? { expectedDeliveryAt } : {}),
        ...(notes !== undefined ? { customerComplaint: notes } : {}),
        ...(additionalNotes !== undefined ? { additionalNotes } : {}),
        ...(nextStatus && nextStatus.id !== existingJobCard.currentStatusId ? { currentStatusId: nextStatus.id } : {}),
        ...(shouldUpdateFinancials
          ? {
            serviceSubtotal,
            taxRate,
            taxAmount,
            discountAmount,
            finalAmount,
            totalEstimate: finalAmount
          }
          : {}),
        modifiedById: user && user.userId ? user.userId : null
      }
    });

    if (nextStatus && nextStatus.id !== existingJobCard.currentStatusId) {
      await tx.jobCardStatusLog.create({
        data: {
          jobCardId,
          statusId: nextStatus.id,
          changedById: user && user.userId ? user.userId : null,
          remarks: `Job card status derived from service updates: ${nextStatus.statusName}`
        }
      });
    }

    return tx.jobCard.findUnique({
      where: { id: jobCardId },
      include: {
        customer: {
          select: { id: true, fullName: true, mobileNo: true, emailId: true, address: true }
        },
        vehicle: {
          select: {
            id: true,
            registrationNo: true,
            model: true,
            variant: true,
            fuelType: true,
            vehicleColor: true,
            brand: {
              select: { id: true, name: true }
            }
          }
        },
        currentStatus: {
          select: { id: true, statusCode: true, statusName: true }
        },
        location: {
          select: { id: true, locationName: true, locationCode: true }
        },
        gateEntry: {
          select: { id: true, entryType: true, gateEntryNo: true }
        },
        services: {
          include: {
            serviceItem: {
              include: {
                category: true
              }
            },
            serviceStatus: true
          }
        },
        workAssignments: {
          include: {
            assignedUser: {
              select: { id: true, fullName: true, employeeCode: true, mobileNo: true }
            },
            status: true,
            jobCardService: {
              select: {
                id: true,
                serviceName: true,
                serviceItem: {
                  select: {
                    category: true
                  }
                }
              }
            }
          }
        }
      }
    });
  });
};

module.exports = {
  listJobCards,
  getJobCardById,
  listJobCardStatuses,
  listJobCardServiceStatuses,
  updateJobCard
};
