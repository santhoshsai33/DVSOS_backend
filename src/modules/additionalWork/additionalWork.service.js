const crypto = require('crypto');
const prisma = require('../../config/db');
const {
  STATUS_MODULE_CODES,
  resolveStatusFromCodes,
  resolveStatusIdFromCodes
} = require('../../common/utils/status.util');
const { validateTwilioRequest } = require('../../providers/whatsapp/whatsapp.service');

const DEPARTMENT_ORDER = ['mechanical', 'body-shop', 'water-wash'];
const DEPARTMENT_ALIASES = {
  mechanical: ['mechanical', 'mechanic', 'mechnanic', 'floor'],
  'body-shop': ['body-shop', 'body_shop', 'body shop', 'bodyshop', 'paint', 'denting'],
  'water-wash': ['water-wash', 'water_wash', 'water wash', 'wash']
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
const ROLE_DEPARTMENTS = {
  floor_supervisor: 'mechanical',
  mechanical: 'mechanical',
  mechanic: 'mechanical',
  body_shop_supervisor: 'body-shop',
  water_wash_supervisor: 'water-wash',
  water_wash_team: 'water-wash',
  water_wash: 'water-wash'
};
const PRIVILEGED_ROLES = new Set(['admin', 'super_admin', 'manager', 'managing_director']);
const APPROVAL_TYPE_ADDITIONAL_WORK = 'ADDITIONAL_WORK';
const ADDITIONAL_WORK_SCHEMA_STATEMENTS = [
  `
IF COL_LENGTH('job_card_approvals', 'approval_code') IS NULL
BEGIN
  ALTER TABLE job_card_approvals ADD approval_code NVARCHAR(30) NULL;
END
  `,
  `
IF COL_LENGTH('job_card_approvals', 'mechanic_explanation') IS NULL
BEGIN
  ALTER TABLE job_card_approvals ADD mechanic_explanation NVARCHAR(MAX) NULL;
END
  `,
  `
IF COL_LENGTH('job_card_services', 'parent_job_card_service_id') IS NULL
BEGIN
  ALTER TABLE job_card_services ADD parent_job_card_service_id INT NULL;
END
  `,
  `
IF NOT EXISTS (
  SELECT 1
  FROM sys.foreign_keys
  WHERE name = 'FK_job_card_services_parent_job_card_service'
)
BEGIN
  ALTER TABLE job_card_services
    ADD CONSTRAINT FK_job_card_services_parent_job_card_service
    FOREIGN KEY (parent_job_card_service_id)
    REFERENCES job_card_services(id);
END
  `,
  `
IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'IX_job_card_approvals_approval_code_unique'
    AND object_id = OBJECT_ID('job_card_approvals')
)
BEGIN
  CREATE UNIQUE INDEX IX_job_card_approvals_approval_code_unique
    ON job_card_approvals(approval_code)
    WHERE approval_code IS NOT NULL;
END
  `,
  `
IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'IX_job_card_services_parent_job_card_service_id'
    AND object_id = OBJECT_ID('job_card_services')
)
BEGIN
  CREATE INDEX IX_job_card_services_parent_job_card_service_id
    ON job_card_services(parent_job_card_service_id);
END
  `
];
let additionalWorkSchemaPromise = null;

const createHttpError = (statusCode, message, data = {}) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.data = data;
  return error;
};

const ensureAdditionalWorkSchema = async () => {
  if (!additionalWorkSchemaPromise) {
    additionalWorkSchemaPromise = (async () => {
      for (const statement of ADDITIONAL_WORK_SCHEMA_STATEMENTS) {
        await prisma.$executeRawUnsafe(statement);
      }
    })().catch((error) => {
      additionalWorkSchemaPromise = null;
      throw error;
    });
  }

  return additionalWorkSchemaPromise;
};

const normalizeText = (value) => String(value || '').trim().toLowerCase().replace(/[_\s]+/g, '-');

const normalizeRoleSlug = (roleSlug) => {
  const normalized = String(roleSlug || '').trim().toLowerCase().replace(/[-\s]+/g, '_');
  return ROLE_ALIASES[normalized] || normalized;
};

const normalizeDepartment = (value) => {
  const normalizedValue = normalizeText(value);

  return DEPARTMENT_ORDER.find((department) => {
    return DEPARTMENT_ALIASES[department].some((alias) => normalizeText(alias) === normalizedValue);
  });
};

const getDepartmentForUser = (user, requestedDepartment) => {
  const roleSlug = normalizeRoleSlug(user && user.roleSlug);
  const userDepartment = ROLE_DEPARTMENTS[roleSlug];

  if (userDepartment) {
    return userDepartment;
  }

  if (PRIVILEGED_ROLES.has(roleSlug)) {
    const department = normalizeDepartment(requestedDepartment);
    if (department) {
      return department;
    }
  }

  throw createHttpError(400, 'Valid additional work department is required');
};

const getServiceDepartment = (service) => {
  const category = service && service.serviceItem && service.serviceItem.category;
  return normalizeDepartment(category && (category.slug || category.name));
};

const toStatusResource = (status) => status
  ? {
    id: status.id,
    code: status.statusCode,
    name: status.statusName
  }
  : null;

const toServiceResource = (service) => ({
  id: service.id,
  jobCardServiceId: service.id,
  serviceItemId: service.serviceItemId,
  parentJobCardServiceId: service.parentJobCardServiceId || null,
  name: service.serviceName,
  serviceName: service.serviceName,
  category: service.serviceItem && service.serviceItem.category ? service.serviceItem.category.name : null,
  categorySlug: service.serviceItem && service.serviceItem.category ? service.serviceItem.category.slug : null,
  price: Number(service.price),
  quantity: service.quantity,
  isAdditional: service.isAdditional,
  approvalStatus: toStatusResource(service.approvalStatus),
  serviceStatus: toStatusResource(service.serviceStatus)
});

const toServiceItemResource = (serviceItem) => ({
  id: serviceItem.id,
  serviceItemId: serviceItem.id,
  name: serviceItem.name,
  serviceName: serviceItem.name,
  category: serviceItem.category ? serviceItem.category.name : null,
  categorySlug: serviceItem.category ? serviceItem.category.slug : null,
  price: Number(serviceItem.defaultPrice),
  defaultPrice: Number(serviceItem.defaultPrice),
  estimatedMinutes: serviceItem.estimatedMinutes
});

const toApprovalResource = (approval) => approval
  ? {
    id: approval.id,
    jobCardId: approval.jobCardId,
    approvalCode: approval.approvalCode,
    approvalType: approval.approvalType,
    totalAmount: Number(approval.totalAmount),
    whatsappMessageId: approval.whatsappMessageId,
    customerResponse: approval.customerResponse,
    mechanicExplanation: approval.mechanicExplanation || null,
    sentAt: approval.sentAt,
    respondedAt: approval.respondedAt,
    status: toStatusResource(approval.status),
    services: (approval.services || []).map(toServiceResource)
  }
  : null;

const resolveRequiredStatus = async (tx, moduleCode, statusCodes, label) => {
  const status = await resolveStatusFromCodes(tx, moduleCode, statusCodes);

  if (!status) {
    throw createHttpError(500, `${label} status is not configured`);
  }

  return status;
};

const resolveRequiredStatusId = async (tx, moduleCode, statusCodes, label) => {
  const statusId = await resolveStatusIdFromCodes(tx, moduleCode, statusCodes);

  if (!statusId) {
    throw createHttpError(500, `${label} status is not configured`);
  }

  return statusId;
};

const parsePositiveInt = (value, label) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createHttpError(400, `${label} must be a positive integer`);
  }

  return parsed;
};

const parseOptionalDate = (value, label) => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw createHttpError(400, `${label} must be a valid date time`);
  }

  return date;
};

const normalizeServiceSelections = (serviceItems) => {
  if (!Array.isArray(serviceItems) || serviceItems.length === 0) {
    throw createHttpError(400, 'At least one additional service item is required');
  }

  const seen = new Set();
  return serviceItems.map((item) => {
    const serviceItemId = parsePositiveInt(
      typeof item === 'object' ? (item.serviceItemId || item.id) : item,
      'serviceItemId'
    );
    const quantity = Math.max(1, Number(typeof item === 'object' && item.quantity !== undefined ? item.quantity : 1) || 1);

    if (seen.has(serviceItemId)) {
      throw createHttpError(400, 'Duplicate additional service items are not allowed');
    }
    seen.add(serviceItemId);

    return { serviceItemId, quantity };
  });
};

const getJobCardForAdditionalWork = (tx, jobCardId, user) => {
  return tx.jobCard.findFirst({
    where: {
      id: jobCardId,
      ...(user && user.locationId ? { locationId: Number(user.locationId) } : {})
    },
    include: {
      customer: true,
      vehicle: {
        include: {
          brand: true
        }
      },
      currentStatus: true,
      approvalStatus: true,
      workAssignments: {
        where: { completedAt: null },
        include: {
          assignedUser: {
            select: { id: true, fullName: true, employeeCode: true, mobileNo: true }
          },
          jobCardService: {
            include: {
              serviceItem: {
                include: {
                  category: true
                }
              }
            }
          },
          status: true
        }
      },
      services: {
        include: {
          serviceItem: {
            include: {
              category: true
            }
          },
          approvalStatus: true,
          serviceStatus: true
        },
        orderBy: { id: 'asc' }
      }
    }
  });
};

const getLatestPendingAdditionalApproval = (tx, jobCardId) => {
  return tx.jobCardApproval.findFirst({
    where: {
      jobCardId,
      approvalType: APPROVAL_TYPE_ADDITIONAL_WORK,
      status: {
        is: {
          statusCode: 'PENDING',
          module: {
            is: {
              moduleCode: STATUS_MODULE_CODES.APPROVAL_STATUS
            }
          }
        }
      }
    },
    include: {
      status: true,
      services: {
        include: {
          serviceItem: {
            include: {
              category: true
            }
          },
          approvalStatus: true,
          serviceStatus: true
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });
};

const buildJobCardResource = (jobCard) => ({
  id: jobCard.id,
  jobCardNo: jobCard.jobCardNo,
  vehicleNumber: jobCard.vehicle ? jobCard.vehicle.registrationNo : null,
  ownerName: jobCard.customer ? jobCard.customer.fullName : null,
  ownerMobile: jobCard.customer ? jobCard.customer.mobileNo : null,
  makeModel: jobCard.vehicle ? [jobCard.vehicle.brand && jobCard.vehicle.brand.name, jobCard.vehicle.model].filter(Boolean).join(' ') : null,
  status: jobCard.currentStatus ? jobCard.currentStatus.statusCode : null,
  approvalStatus: jobCard.approvalStatus ? jobCard.approvalStatus.statusCode : null,
  createdAt: jobCard.createdAt,
  expectedDeliveryAt: jobCard.expectedDeliveryAt,
  serviceSubtotal: jobCard.serviceSubtotal === null || jobCard.serviceSubtotal === undefined ? null : Number(jobCard.serviceSubtotal),
  taxRate: jobCard.taxRate === null || jobCard.taxRate === undefined ? null : Number(jobCard.taxRate),
  taxAmount: jobCard.taxAmount === null || jobCard.taxAmount === undefined ? null : Number(jobCard.taxAmount),
  discountAmount: jobCard.discountAmount === null || jobCard.discountAmount === undefined ? null : Number(jobCard.discountAmount),
  finalAmount: jobCard.finalAmount === null || jobCard.finalAmount === undefined ? null : Number(jobCard.finalAmount),
  technician: (jobCard.workAssignments || [])
    .map((assignment) => assignment.assignedUser && assignment.assignedUser.fullName)
    .filter(Boolean)
    .join(', ') || null
});

const listAvailableServiceItems = (tx, department) => {
  return tx.serviceItem.findMany({
    where: {
      isActive: true,
      category: {
        isActive: true,
        OR: DEPARTMENT_ALIASES[department].map((alias) => ({
          slug: normalizeText(alias)
        }))
      }
    },
    include: {
      category: true
    },
    orderBy: { name: 'asc' }
  });
};

const getContext = async (jobCardId, query, user) => {
  await ensureAdditionalWorkSchema();

  const id = parsePositiveInt(jobCardId, 'jobCardId');
  const department = getDepartmentForUser(user, query.department || query.category);

  const [jobCard, serviceItems, pendingApproval] = await prisma.$transaction(async (tx) => {
    const [foundJobCard, availableItems, latestPendingApproval] = await Promise.all([
      getJobCardForAdditionalWork(tx, id, user),
      listAvailableServiceItems(tx, department),
      getLatestPendingAdditionalApproval(tx, id)
    ]);

    return [foundJobCard, availableItems, latestPendingApproval];
  });

  if (!jobCard) {
    throw createHttpError(404, 'Job card not found');
  }

  return {
    department,
    jobCard: buildJobCardResource(jobCard),
    currentServices: jobCard.services.map(toServiceResource),
    eligibleParentServices: jobCard.services
      .filter((service) => getServiceDepartment(service) === department && !service.isAdditional)
      .map(toServiceResource),
    availableServices: serviceItems.map(toServiceItemResource),
    pendingApproval: toApprovalResource(pendingApproval)
  };
};

const generateApprovalCode = async (tx) => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = `AW${crypto.randomInt(100000, 999999)}`;
    const existing = await tx.jobCardApproval.findFirst({
      where: { approvalCode: code },
      select: { id: true }
    });

    if (!existing) {
      return code;
    }
  }

  throw createHttpError(500, 'Could not generate approval code');
};

const createRequest = async (jobCardId, payload, user) => {
  await ensureAdditionalWorkSchema();

  const id = parsePositiveInt(jobCardId, 'jobCardId');
  const explanation = String(payload.mechanicExplanation || payload.explanation || payload.notes || '').trim();
  if (explanation.length < 5) {
    throw createHttpError(400, 'Mechanic explanation is required');
  }

  const department = getDepartmentForUser(user, payload.department || payload.category);
  const parentJobCardServiceId = parsePositiveInt(payload.parentJobCardServiceId, 'parentJobCardServiceId');
  const selections = normalizeServiceSelections(payload.serviceItems || payload.services);
  const expectedDeliveryAt = parseOptionalDate(payload.expectedDeliveryAt, 'expectedDeliveryAt');

  return prisma.$transaction(async (tx) => {
    const jobCard = await getJobCardForAdditionalWork(tx, id, user);
    if (!jobCard) {
      throw createHttpError(404, 'Job card not found');
    }

    const parentService = jobCard.services.find((service) => service.id === parentJobCardServiceId);
    if (!parentService) {
      throw createHttpError(400, 'Parent job card service is invalid');
    }

    if (getServiceDepartment(parentService) !== department) {
      throw createHttpError(400, 'Parent service does not belong to this department');
    }

    const serviceItems = await tx.serviceItem.findMany({
      where: {
        id: {
          in: selections.map((selection) => selection.serviceItemId)
        },
        isActive: true,
        category: {
          isActive: true
        }
      },
      include: {
        category: true
      }
    });
    const serviceItemMap = new Map(serviceItems.map((item) => [item.id, item]));

    if (serviceItems.length !== selections.length) {
      throw createHttpError(400, 'One or more selected service items are invalid or inactive');
    }

    for (const serviceItem of serviceItems) {
      if (normalizeDepartment(serviceItem.category && (serviceItem.category.slug || serviceItem.category.name)) !== department) {
        throw createHttpError(400, 'One or more selected service items are outside this department');
      }
    }

    const approvedApprovalStatus = await resolveRequiredStatus(tx, STATUS_MODULE_CODES.APPROVAL_STATUS, ['APPROVED'], 'Approved approval');
    const pendingServiceStatusId = await resolveRequiredStatusId(tx, STATUS_MODULE_CODES.JOB_CARD_SERVICE, ['PENDING'], 'Pending job card service');
    const approvalCode = await generateApprovalCode(tx);
    const totalAmount = selections.reduce((sum, selection) => {
      const serviceItem = serviceItemMap.get(selection.serviceItemId);
      return sum + (Number(serviceItem.defaultPrice) * selection.quantity);
    }, 0);

    const approval = await tx.jobCardApproval.create({
      data: {
        jobCardId: jobCard.id,
        statusId: approvedApprovalStatus.id,
        approvalCode,
        approvalType: APPROVAL_TYPE_ADDITIONAL_WORK,
        totalAmount,
        customerResponse: 'AUTO_APPROVED',
        sentAt: null,
        respondedAt: new Date(),
        createdById: user && user.userId ? user.userId : null
      }
    });

    await tx.$executeRaw`
      UPDATE job_card_approvals
      SET mechanic_explanation = ${explanation}
      WHERE id = ${approval.id}
    `;

    const createdServices = [];
    for (const selection of selections) {
      const serviceItem = serviceItemMap.get(selection.serviceItemId);
      const createdService = await tx.jobCardService.create({
        data: {
          jobCardId: jobCard.id,
          approvalId: approval.id,
          parentJobCardServiceId,
          serviceItemId: serviceItem.id,
          approvalStatusId: approvedApprovalStatus.id,
          serviceStatusId: pendingServiceStatusId,
          serviceName: serviceItem.name,
          price: Number(serviceItem.defaultPrice),
          quantity: selection.quantity,
          isAdditional: true,
          createdById: user && user.userId ? user.userId : null
        },
        include: {
          serviceItem: {
            include: {
              category: true
            }
          },
          approvalStatus: true,
          serviceStatus: true
        }
      });
      createdServices.push(createdService);
    }

    await tx.jobCard.update({
      where: { id: jobCard.id },
      data: {
        approvalStatusId: approvedApprovalStatus.id,
        ...(expectedDeliveryAt ? { expectedDeliveryAt } : {}),
        modifiedById: user && user.userId ? user.userId : null
      }
    });

    const updatedApproval = await tx.jobCardApproval.findUnique({
      where: { id: approval.id },
      include: {
        status: true,
        services: {
          include: {
            serviceItem: {
              include: {
                category: true
              }
            },
            approvalStatus: true,
            serviceStatus: true
          }
        }
      }
    });

    return {
      approval: toApprovalResource(updatedApproval),
      services: createdServices.map(toServiceResource)
    };
  }, { timeout: 30000 });
};

const parseApprovalReply = (body) => {
  const text = String(body || '').trim().toUpperCase();
  const match = text.match(/\b(YES|Y|APPROVE|APPROVED|NO|N|REJECT|REJECTED)\b[\s:#-]*([A-Z]{2}\d{6})\b/);

  if (!match) {
    throw createHttpError(400, 'Could not parse approval response');
  }

  const responseWord = match[1];
  return {
    decision: ['YES', 'Y', 'APPROVE', 'APPROVED'].includes(responseWord) ? 'APPROVED' : 'REJECTED',
    approvalCode: match[2]
  };
};

const handleTwilioWebhook = async (req) => {
  await ensureAdditionalWorkSchema();

  if (!validateTwilioRequest(req)) {
    throw createHttpError(403, 'Invalid Twilio signature');
  }

  const { decision, approvalCode } = parseApprovalReply(req.body && req.body.Body);

  return prisma.$transaction(async (tx) => {
    const approval = await tx.jobCardApproval.findFirst({
      where: {
        approvalCode,
        approvalType: APPROVAL_TYPE_ADDITIONAL_WORK
      },
      include: {
        jobCard: true,
        status: true,
        services: {
          include: {
            approvalStatus: true,
            serviceStatus: true
          }
        }
      }
    });

    if (!approval) {
      throw createHttpError(404, 'Approval request not found');
    }

    if (approval.respondedAt) {
      return {
        approval: toApprovalResource(approval),
        alreadyResponded: true
      };
    }

    const approvalStatus = await resolveRequiredStatus(tx, STATUS_MODULE_CODES.APPROVAL_STATUS, [decision], `${decision.toLowerCase()} approval`);
    const serviceStatusId = decision === 'REJECTED'
      ? await resolveRequiredStatusId(tx, STATUS_MODULE_CODES.JOB_CARD_SERVICE, ['REJECTED'], 'Rejected job card service')
      : null;
    const now = new Date();

    await tx.jobCardApproval.update({
      where: { id: approval.id },
      data: {
        statusId: approvalStatus.id,
        customerResponse: String(req.body.Body || '').trim(),
        respondedAt: now,
        modifiedById: null
      }
    });

    await tx.jobCardService.updateMany({
      where: {
        approvalId: approval.id
      },
      data: {
        approvalStatusId: approvalStatus.id,
        ...(serviceStatusId ? { serviceStatusId } : {}),
        modifiedById: null
      }
    });

    await tx.jobCard.update({
      where: { id: approval.jobCardId },
      data: {
        approvalStatusId: approvalStatus.id
      }
    });

    const updatedApproval = await tx.jobCardApproval.findUnique({
      where: { id: approval.id },
      include: {
        status: true,
        services: {
          include: {
            serviceItem: {
              include: {
                category: true
              }
            },
            approvalStatus: true,
            serviceStatus: true
          }
        }
      }
    });

    return {
      approval: toApprovalResource(updatedApproval),
      alreadyResponded: false
    };
  });
};

module.exports = {
  getContext,
  createRequest,
  handleTwilioWebhook
};
