const prisma = require('../../config/db');
const {
  STATUS_MODULE_CODES,
  resolveStatusIdFromCodes
} = require('../../common/utils/status.util');
const { createAuditLog, buildChangeDetails } = require('../../common/utils/audit.util');
const { getSocket } = require('../../config/socket');

const DEPARTMENT_ORDER = ['mechanical', 'body-shop', 'water-wash'];

const DEPARTMENT_ALIASES = {
  mechanical: ['mechanical', 'mechanic', 'mechnanic', 'floor'],
  'body-shop': ['body-shop', 'body_shop', 'body shop', 'bodyshop', 'paint', 'denting'],
  'water-wash': ['water-wash', 'water_wash', 'water wash', 'wash']
};

const ASSIGNMENT_STATUS_CODES = {
  mechanical: {
    assigned: ['MECHANICAL_ASSIGNED'],
    inProgress: ['MECHANICAL_IN_PROGRESS'],
    completed: ['MECHANICAL_COMPLETED']
  },
  'body-shop': {
    assigned: ['BODY_SHOP_ASSIGNED'],
    inProgress: ['BODY_SHOP_IN_PROGRESS'],
    completed: ['BODY_SHOP_COMPLETED']
  },
  'water-wash': {
    assigned: ['WATER_WASH_ASSIGNED'],
    inProgress: ['WATER_WASH_IN_PROGRESS'],
    completed: ['WATER_WASH_COMPLETED']
  }
};

const JOB_CARD_SERVICE_STATUS_CODES = {
  assigned: ['ASSIGNED'],
  inProgress: ['IN_PROGRESS'],
  completed: ['COMPLETED']
};

const READY_FOR_DELIVERY_STATUS_CODES = ['READY_FOR_DELIVERY'];
const FINAL_JOB_CARD_STATUS_CODES = ['DELIVERED', 'REJECTED'];
const REJECTED_APPROVAL_STATUS_CODES = ['REJECTED'];
const APPROVED_APPROVAL_STATUS_CODES = ['APPROVED'];

const createHttpError = (statusCode, message, data = {}) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.data = data;
  return error;
};

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const resolveRequiredStatusId = async (tx, moduleCode, statusCodes, label) => {
  const statusId = await resolveStatusIdFromCodes(tx, moduleCode, statusCodes);

  if (!statusId) {
    throw createHttpError(500, `${label} status is not configured`);
  }

  return statusId;
};

const normalizeText = (value) => String(value || '').trim().toLowerCase().replace(/[_\s]+/g, '-');

const normalizeDepartment = (value) => {
  const normalizedValue = normalizeText(value);

  return DEPARTMENT_ORDER.find((department) => {
    return DEPARTMENT_ALIASES[department].some((alias) => normalizeText(alias) === normalizedValue);
  });
};

const getServiceDepartment = (service) => {
  const category = service && service.serviceItem && service.serviceItem.category;
  return normalizeDepartment(category && (category.slug || category.name));
};

const getStatusCode = (status) => String((status && status.statusCode) || '').trim().toUpperCase();

const isApprovedForWork = (service) => {
  if (!service || !service.isAdditional) {
    return true;
  }

  return APPROVED_APPROVAL_STATUS_CODES.includes(getStatusCode(service.approvalStatus));
};

const isRejectedAdditionalService = (service) => {
  return Boolean(service && service.isAdditional && REJECTED_APPROVAL_STATUS_CODES.includes(getStatusCode(service.approvalStatus)));
};

const isCompletedStatusCode = (statusCode) => {
  const code = String(statusCode || '').trim().toUpperCase();
  return code === 'COMPLETED' || code.endsWith('_COMPLETED');
};

const getDepartmentServices = (jobCard, department) => {
  return (jobCard.services || []).filter((service) => getServiceDepartment(service) === department);
};

const hasAssignment = (service) => {
  return (service.workAssignments || []).length > 0;
};

const isServiceCompleted = (service, department) => {
  if (isRejectedAdditionalService(service)) {
    return true;
  }

  const serviceStatusCode = getStatusCode(service.serviceStatus);
  const completedCodes = ASSIGNMENT_STATUS_CODES[department].completed;

  if (completedCodes.includes(serviceStatusCode) || isCompletedStatusCode(serviceStatusCode)) {
    return true;
  }

  const assignments = service.workAssignments || [];

  return assignments.length > 0 && assignments.every((assignment) => {
    return assignment.completedAt || completedCodes.includes(getStatusCode(assignment.status));
  });
};

const isJobCardServiceCompleted = (service) => {
  if (isRejectedAdditionalService(service)) {
    return true;
  }

  if (isCompletedStatusCode(getStatusCode(service.serviceStatus))) {
    return true;
  }

  const assignments = service.workAssignments || [];
  return assignments.length > 0 && assignments.every((assignment) => {
    return assignment.completedAt || isCompletedStatusCode(getStatusCode(assignment.status));
  });
};

const areAllJobCardServicesCompleted = (jobCard) => {
  const services = jobCard.services || [];
  return services.length > 0 && services.every(isJobCardServiceCompleted);
};

const areDepartmentServicesCompleted = (jobCard, department) => {
  const services = getDepartmentServices(jobCard, department).filter((service) => {
    return isApprovedForWork(service) && !isRejectedAdditionalService(service);
  });
  return services.length === 0 || services.every((service) => isServiceCompleted(service, department));
};

const areDepartmentServicesAssigned = (jobCard, department) => {
  const services = getDepartmentServices(jobCard, department).filter((service) => {
    return isApprovedForWork(service) && !isRejectedAdditionalService(service);
  });
  return services.length > 0 && services.every(hasAssignment);
};

const hasDepartmentServices = (jobCard, department) => {
  return getDepartmentServices(jobCard, department).length > 0;
};

const hasDepartmentServicesAvailableForWork = (jobCard, department) => {
  return getDepartmentServices(jobCard, department).some((service) => {
    return isApprovedForWork(service) && !isRejectedAdditionalService(service);
  });
};

const isJobCardActiveForQueue = (jobCard) => {
  const currentStatusCode = getStatusCode(jobCard.currentStatus);
  const approvalStatusCode = getStatusCode(jobCard.approvalStatus);

  return !FINAL_JOB_CARD_STATUS_CODES.includes(currentStatusCode)
    && !REJECTED_APPROVAL_STATUS_CODES.includes(approvalStatusCode);
};

const canShowInDepartmentQueue = (jobCard, department) => {
  if (!isJobCardActiveForQueue(jobCard) || !hasDepartmentServicesAvailableForWork(jobCard, department)) {
    return false;
  }

  if (areDepartmentServicesAssigned(jobCard, department)) {
    return false;
  }

  if (areDepartmentServicesCompleted(jobCard, department)) {
    return false;
  }

  const departmentIndex = DEPARTMENT_ORDER.indexOf(department);
  const previousDepartments = DEPARTMENT_ORDER.slice(0, departmentIndex);

  return previousDepartments.every((previousDepartment) => {
    return !hasDepartmentServices(jobCard, previousDepartment)
      || areDepartmentServicesCompleted(jobCard, previousDepartment);
  });
};

const buildWhere = (query, user) => {
  const where = {};
  const locationId = user && user.locationId ? user.locationId : query.locationId;

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

  return where;
};

const queueJobCardSelect = {
  id: true,
  locationId: true,
  jobCardNo: true,
  expectedDeliveryAt: true,
  createdAt: true,
  currentStatus: {
    select: {
      id: true,
      statusCode: true,
      statusName: true
    }
  },
  approvalStatus: {
    select: {
      id: true,
      statusCode: true,
      statusName: true
    }
  },
  customer: {
    select: {
      id: true,
      fullName: true,
      mobileNo: true
    }
  },
  vehicle: {
    select: {
      id: true,
      registrationNo: true,
      model: true,
      brand: {
        select: {
          name: true
        }
      }
    }
  },
  services: {
    select: {
      id: true,
      serviceName: true,
      serviceItemId: true,
      price: true,
      quantity: true,
      isAdditional: true,
      serviceStatus: {
        select: {
          id: true,
          statusCode: true,
          statusName: true
        }
      },
      approvalStatus: {
        select: {
          id: true,
          statusCode: true,
          statusName: true
        }
      },
      serviceItem: {
        select: {
          id: true,
          estimatedMinutes: true,
          category: {
            select: {
              id: true,
              name: true,
              slug: true
            }
          }
        }
      },
      workAssignments: {
        select: {
          id: true,
          assignedUserId: true,
          assignedAt: true,
          startedAt: true,
          completedAt: true,
          status: {
            select: {
              id: true,
              statusCode: true,
              statusName: true
            }
          }
        }
      }
    }
  }
};

const minutesBetween = (fromDate, toDate = new Date()) => {
  return Math.max(0, Math.floor((toDate.getTime() - new Date(fromDate).getTime()) / 60000));
};

const toQueueResponse = (jobCard, department) => {
  const services = getDepartmentServices(jobCard, department)
    .filter((service) => isApprovedForWork(service) && !isRejectedAdditionalService(service));

  return {
    jobCardId: jobCard.id,
    jobCardNo: jobCard.jobCardNo,
    vehicleNo: jobCard.vehicle ? jobCard.vehicle.registrationNo : null,
    customerName: jobCard.customer ? jobCard.customer.fullName : null,
    customerMobileNo: jobCard.customer ? jobCard.customer.mobileNo : null,
    vehicleModel: jobCard.vehicle ? [jobCard.vehicle.brand && jobCard.vehicle.brand.name, jobCard.vehicle.model].filter(Boolean).join(' ') || null : null,
    category: department,
    services: services.map((service) => ({
      id: service.id,
      serviceItemId: service.serviceItemId,
      name: service.serviceName,
      price: Number(service.price),
      quantity: service.quantity,
      isAdditional: service.isAdditional,
      approvalStatus: service.approvalStatus
        ? {
          id: service.approvalStatus.id,
          code: service.approvalStatus.statusCode,
          name: service.approvalStatus.statusName
        }
        : null
    })),
    serviceNames: services.map((service) => service.serviceName),
    priority: services.some((service) => service.isAdditional) ? 'HIGH' : 'NORMAL',
    waitMinutes: minutesBetween(jobCard.createdAt),
    expectedDeliveryAt: jobCard.expectedDeliveryAt,
    currentStatus: jobCard.currentStatus
      ? {
        id: jobCard.currentStatus.id,
        code: jobCard.currentStatus.statusCode,
        name: jobCard.currentStatus.statusName
      }
      : null,
    approvalStatus: jobCard.approvalStatus
      ? {
        id: jobCard.approvalStatus.id,
        code: jobCard.approvalStatus.statusCode,
        name: jobCard.approvalStatus.statusName
      }
      : null
  };
};

const listQueue = async (department, query, user) => {
  const page = parsePositiveInt(query.page, 1);
  const limit = parsePositiveInt(query.limit, 10);
  const where = buildWhere(query, user);

  const jobCards = await prisma.jobCard.findMany({
    where,
    select: queueJobCardSelect,
    orderBy: {
      createdAt: 'asc'
    }
  });

  const queue = jobCards
    .filter((jobCard) => canShowInDepartmentQueue(jobCard, department))
    .map((jobCard) => toQueueResponse(jobCard, department));

  const startIndex = (page - 1) * limit;
  const pagedQueue = queue.slice(startIndex, startIndex + limit);

  return {
    queue: pagedQueue,
    meta: {
      page,
      limit,
      total: queue.length,
      totalPages: Math.ceil(queue.length / limit)
    }
  };
};

const getAssignDepartment = (payload) => {
  const department = normalizeDepartment(payload && payload.category);

  if (!department) {
    throw createHttpError(400, 'Valid category is required');
  }

  return department;
};

const buildAssignmentServiceIds = (jobCard, department, requestedServiceIds) => {
  const departmentServices = getDepartmentServices(jobCard, department);
  const unassignedServices = departmentServices.filter((service) => isApprovedForWork(service) && !isRejectedAdditionalService(service) && !hasAssignment(service));

  if (requestedServiceIds && requestedServiceIds.length > 0) {
    const requestedIdSet = new Set(requestedServiceIds.map(Number));
    const services = unassignedServices.filter((service) => requestedIdSet.has(service.id));

    if (services.length !== requestedIdSet.size) {
      throw createHttpError(400, 'One or more job card services are invalid, already assigned, or not in this queue category');
    }

    return services.map((service) => service.id);
  }

  return unassignedServices.map((service) => service.id);
};

const toAssignmentResponse = (assignment) => ({
  id: assignment.id,
  jobCardId: assignment.jobCardId,
  jobCardServiceId: assignment.jobCardServiceId,
  assignedUserId: assignment.assignedUserId,
  assignedById: assignment.assignedById,
  assignedAt: assignment.assignedAt,
  startedAt: assignment.startedAt,
  completedAt: assignment.completedAt,
  remarks: assignment.remarks,
  status: assignment.status
    ? {
      id: assignment.status.id,
      code: assignment.status.statusCode,
      name: assignment.status.statusName
    }
    : null
});

const assignWork = async (jobCardId, payload, user) => {
  const id = Number(jobCardId);
  const department = getAssignDepartment(payload);
  const assignedUserId = Number(payload.assignedUserId);
  const requestedServiceIds = Array.isArray(payload.jobCardServiceIds) ? payload.jobCardServiceIds.map(Number) : undefined;

  return prisma.$transaction(async (tx) => {
    const jobCard = await tx.jobCard.findFirst({
      where: {
        id,
        ...(user && user.locationId ? { locationId: Number(user.locationId) } : {})
      },
      select: queueJobCardSelect
    });

    if (!jobCard) {
      throw createHttpError(404, 'Job card not found');
    }

    if (!canShowInDepartmentQueue(jobCard, department)) {
      throw createHttpError(400, 'Job card is not available in this queue');
    }

    const assignedUser = await tx.user.findFirst({
      where: {
        id: assignedUserId,
        isActive: true,
        ...(jobCard.locationId ? { locationId: jobCard.locationId } : {})
      },
      select: {
        id: true
      }
    });

    if (!assignedUser) {
      throw createHttpError(400, 'Assigned user is invalid or inactive for this location');
    }

    const serviceIds = buildAssignmentServiceIds(jobCard, department, requestedServiceIds);

    if (serviceIds.length === 0) {
      throw createHttpError(400, 'No unassigned services found for this queue category');
    }

    const statusId = await resolveRequiredStatusId(
      tx,
      STATUS_MODULE_CODES.WORK_ASSIGNMENT,
      ASSIGNMENT_STATUS_CODES[department].assigned,
      `${department} assignment`
    );
    const serviceStatusId = await resolveRequiredStatusId(
      tx,
      STATUS_MODULE_CODES.JOB_CARD_SERVICE,
      JOB_CARD_SERVICE_STATUS_CODES.assigned,
      'Job card service assigned'
    );

    await tx.workAssignment.createMany({
      data: serviceIds.map((jobCardServiceId) => ({
        locationId: jobCard.locationId,
        jobCardId: jobCard.id,
        jobCardServiceId,
        statusId,
        assignedUserId,
        assignedById: user && user.userId ? user.userId : null,
        remarks: payload.remarks ? String(payload.remarks).trim() : null,
        createdById: user && user.userId ? user.userId : null
      }))
    });

    await tx.jobCardService.updateMany({
      where: {
        id: {
          in: serviceIds
        }
      },
      data: {
        serviceStatusId,
        modifiedById: user && user.userId ? user.userId : null
      }
    });

    const jobCardStatusId = await resolveRequiredStatusId(
      tx,
      STATUS_MODULE_CODES.JOB_CARD_STATUS,
      ASSIGNMENT_STATUS_CODES[department].assigned,
      `${department} job card assigned`
    );

    await tx.jobCard.update({
      where: { id: jobCard.id },
      data: {
        currentStatusId: jobCardStatusId,
        modifiedById: user && user.userId ? user.userId : null
      }
    });

    // await tx.jobCardStatusLog.create({
    //   data: {
    //     jobCardId: jobCard.id,
    //     statusId: jobCardStatusId,
    //     changedById: user && user.userId ? user.userId : null,
    //     remarks: `${department} work assigned`
    //   }
    // });

    const assignments = await tx.workAssignment.findMany({
      where: {
        jobCardId: jobCard.id,
        jobCardServiceId: {
          in: serviceIds
        }
      },
      include: {
        status: {
          select: {
            id: true,
            statusCode: true,
            statusName: true
          }
        }
      },
      orderBy: {
        id: 'asc'
      }
    });

    await createAuditLog(tx, {
      moduleCode: 'work-assignments',
      moduleName: 'Work Assignments',
      tableName: 'work_assignments',
      recordId: jobCard.id,
      actionType: 'CREATE',
      performedByUserId: user && user.userId ? user.userId : null,
      recordName: jobCard.jobCardNo,
      comments: `Work assigned to user ${assignedUserId}`,
      details: []
    });

    return {
      jobCardId: jobCard.id,
      category: department,
      assignments: assignments.map(toAssignmentResponse)
    };
  });
};

const updateAssignmentStatus = async (assignmentId, payload, user) => {
  const id = Number(assignmentId);
  const requestedStatus = String(payload.status || '').trim().toUpperCase();

  return prisma.$transaction(async (tx) => {
    const assignment = await tx.workAssignment.findFirst({
      where: {
        id,
        ...(user && user.locationId ? { locationId: Number(user.locationId) } : {})
      },
      include: {
        status: true,
        jobCardService: {
          include: {
            approvalStatus: true,
            serviceItem: {
              include: {
                category: true
              }
            }
          }
        },
        jobCard: {
          select: {
            id: true,
            locationId: true
          }
        }
      }
    });

    if (!assignment) {
      throw createHttpError(404, 'Work assignment not found');
    }

    if (!isApprovedForWork(assignment.jobCardService) || isRejectedAdditionalService(assignment.jobCardService)) {
      throw createHttpError(400, 'Additional work must be customer approved before work can start');
    }

    const department = getServiceDepartment(assignment.jobCardService);

    if (!department) {
      throw createHttpError(400, 'Assignment service category is not supported');
    }

    const statusCodes = requestedStatus === 'COMPLETED'
      ? ASSIGNMENT_STATUS_CODES[department].completed
      : ASSIGNMENT_STATUS_CODES[department].inProgress;
    const statusId = await resolveRequiredStatusId(
      tx,
      STATUS_MODULE_CODES.WORK_ASSIGNMENT,
      statusCodes,
      `${department} assignment ${requestedStatus.toLowerCase()}`
    );
    const serviceStatusId = await resolveRequiredStatusId(
      tx,
      STATUS_MODULE_CODES.JOB_CARD_SERVICE,
      requestedStatus === 'COMPLETED'
        ? JOB_CARD_SERVICE_STATUS_CODES.completed
        : JOB_CARD_SERVICE_STATUS_CODES.inProgress,
      `Job card service ${requestedStatus.toLowerCase()}`
    );
    const jobCardStatusId = await resolveRequiredStatusId(
      tx,
      STATUS_MODULE_CODES.JOB_CARD_STATUS,
      statusCodes,
      `${department} job card ${requestedStatus.toLowerCase()}`
    );
    const now = new Date();
    const updateData = {
      statusId,
      modifiedById: user && user.userId ? user.userId : null
    };

    if (requestedStatus === 'IN_PROGRESS') {
      updateData.startedAt = assignment.startedAt || now;
    }

    if (requestedStatus === 'COMPLETED') {
      updateData.startedAt = assignment.startedAt || now;
      updateData.completedAt = now;
    }

    const updatedAssignment = await tx.workAssignment.update({
      where: {
        id: assignment.id
      },
      data: updateData,
      include: {
        status: {
          select: {
            id: true,
            statusCode: true,
            statusName: true
          }
        }
      }
    });

    await tx.jobCardService.update({
      where: {
        id: assignment.jobCardServiceId
      },
      data: {
        serviceStatusId,
        modifiedById: user && user.userId ? user.userId : null
      }
    });

    if (requestedStatus === 'COMPLETED') {
      const latestJobCard = await tx.jobCard.findUnique({
        where: {
          id: assignment.jobCardId
        },
        select: queueJobCardSelect
      });
      const isDepartmentComplete = latestJobCard && areDepartmentServicesCompleted(latestJobCard, department);
      const isJobCardComplete = latestJobCard && areAllJobCardServicesCompleted(latestJobCard);

      if (isJobCardComplete) {
        const readyForDeliveryStatusId = await resolveRequiredStatusId(
          tx,
          STATUS_MODULE_CODES.JOB_CARD_STATUS,
          READY_FOR_DELIVERY_STATUS_CODES,
          'Ready for delivery job card'
        );

        await tx.jobCard.update({
          where: {
            id: assignment.jobCardId
          },
          data: {
            currentStatusId: readyForDeliveryStatusId,
            modifiedById: user && user.userId ? user.userId : null
          }
        });
      } else if (isDepartmentComplete) {
        await tx.jobCard.update({
          where: {
            id: assignment.jobCardId
          },
          data: {
            currentStatusId: jobCardStatusId,
            modifiedById: user && user.userId ? user.userId : null
          }
        });

        // await tx.jobCardStatusLog.create({
        //   data: {
        //     jobCardId: assignment.jobCardId,
        //     statusId: jobCardStatusId,
        //     changedById: user && user.userId ? user.userId : null,
        //     remarks: `${department} work completed`
        //   }
        // });
      }
    } else {
      await tx.jobCard.update({
        where: {
          id: assignment.jobCardId
        },
        data: {
          currentStatusId: jobCardStatusId,
          modifiedById: user && user.userId ? user.userId : null
        }
      });

      // await tx.jobCardStatusLog.create({
      //   data: {
      //     jobCardId: assignment.jobCardId,
      //     statusId: jobCardStatusId,
      //     changedById: user && user.userId ? user.userId : null,
      //     remarks: `${department} work in progress`
      //   }
      // });
    }

    await createAuditLog(tx, {
      moduleCode: 'work-assignments',
      moduleName: 'Work Assignments',
      tableName: 'work_assignments',
      recordId: assignment.id,
      actionType: 'UPDATE',
      performedByUserId: user && user.userId ? user.userId : null,
      recordName: `Assignment ${assignment.id}`,
      comments: `Assignment status updated to ${requestedStatus}`,
      details: buildChangeDetails(assignment, updatedAssignment, ['statusId', 'startedAt', 'completedAt'])
    });

    return {
      assignment: toAssignmentResponse(updatedAssignment)
    };
  });
};

module.exports = {
  listQueue,
  assignWork,
  updateAssignmentStatus
};
