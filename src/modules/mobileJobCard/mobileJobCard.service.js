const fs = require('fs/promises');
const prisma = require('../../config/db');
const { createAuditLog } = require('../../common/utils/audit.util');
const { CODE_CONFIG, generateUniqueCode } = require('../../common/utils/code.util');
const { generateSlug, generateUniqueSlug } = require('../../common/utils/slug.util');
const { normalizeVehicleNumber } = require('../../utils/normalizeVehicleNumber');
const { createStorageProvider } = require('../../providers/storage/storage.provider');

const JOB_CARD_CREATED_STATUS_CODES = ['JOB_CARD_CREATED', 'CREATED'];

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

const toTrimmedString = (value) => {
  if (value === undefined || value === null) {
    return undefined;
  }

  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
};

const toOptionalNumber = (value) => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const isDateOnlyString = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim());

const parseDateQuery = (value, fieldName, endOfDay = false) => {
  const trimmed = toTrimmedString(value);

  if (!trimmed) {
    return undefined;
  }

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    throw createHttpError(400, `${fieldName} must be a valid date`);
  }

  if (endOfDay && isDateOnlyString(trimmed)) {
    date.setUTCHours(23, 59, 59, 999);
  }

  return date;
};

const normalizeRoleSlug = (slug) => String(slug || '').trim().toLowerCase().replace(/-/g, '_');
const isLocationScopedViewer = (user) => {
  return ['crm_team', 'manager', 'managing_director'].includes(normalizeRoleSlug(user && user.roleSlug));
};

const resolveLocationFilter = (query, user) => {
  if (isLocationScopedViewer(user)) {
    if (!user.locationId) {
      throw createHttpError(400, 'Location is required for this role');
    }

    return Number(user.locationId);
  }

  if (user && user.locationId) {
    return Number(user.locationId);
  }

  return parsePositiveInt(query.locationId, undefined);
};

const resolveStatusId = async (tx, codes) => {
  const status = await tx.statusMaster.findFirst({
    where: {
      isActive: true,
      statusCode: {
        in: codes
      }
    },
    orderBy: {
      id: 'asc'
    },
    select: {
      id: true
    }
  });

  return status ? status.id : null;
};

const createUniqueSlug = (tx, model, source) => {
  const baseSlug = generateSlug(source);

  if (!baseSlug) {
    throw createHttpError(400, 'Valid slug could not be generated');
  }

  return generateUniqueSlug(baseSlug, (slug) => {
    return tx[model].findFirst({
      where: { slug },
      select: { id: true }
    });
  });
};

const generateJobCardNo = async (tx) => {
  const latestJobCard = await tx.jobCard.findFirst({
    where: {
      jobCardNo: {
        startsWith: CODE_CONFIG.jobCard.prefix
      }
    },
    orderBy: { id: 'desc' },
    select: { jobCardNo: true }
  });

  return generateUniqueCode({
    prefix: CODE_CONFIG.jobCard.prefix,
    latestCode: latestJobCard ? latestJobCard.jobCardNo : null,
    existsCallback: async (jobCardNo) => {
      const existingJobCard = await tx.jobCard.findFirst({
        where: { jobCardNo },
        select: { id: true }
      });

      return !!existingJobCard;
    }
  });
};

const resolveVehicleBrandId = async (tx, make, actorUserId) => {
  const brandName = toTrimmedString(make);

  if (!brandName) {
    return undefined;
  }

  const slug = generateSlug(brandName);
  if (!slug) {
    return undefined;
  }

  const existingBrand = await tx.vehicleBrand.findFirst({
    where: { slug },
    select: { id: true }
  });

  if (existingBrand) {
    return existingBrand.id;
  }

  const brand = await tx.vehicleBrand.create({
    data: {
      name: brandName,
      slug,
      createdById: actorUserId || null
    },
    select: { id: true }
  });

  return brand.id;
};

const buildVehicleUpdateData = async (tx, vehicleInfo = {}, actorUserId) => {
  const data = {};
  const registrationNumber = toTrimmedString(vehicleInfo.registrationNumber || vehicleInfo.vehicleNumber);

  if (registrationNumber) {
    data.registrationNo = normalizeVehicleNumber(registrationNumber);
  }

  const model = toTrimmedString(vehicleInfo.model || vehicleInfo.vehicleModel);
  if (model !== undefined) {
    data.model = model;
  }

  const variant = toTrimmedString(vehicleInfo.variant);
  if (variant !== undefined) {
    data.variant = variant;
  }

  const fuelType = toTrimmedString(vehicleInfo.fuelType);
  if (fuelType !== undefined) {
    data.fuelType = fuelType;
  }

  const vehicleColor = toTrimmedString(vehicleInfo.color || vehicleInfo.vehicleColor);
  if (vehicleColor !== undefined) {
    data.vehicleColor = vehicleColor;
  }

  const chassisNo = toTrimmedString(vehicleInfo.chassisNo);
  if (chassisNo !== undefined) {
    data.chassisNo = chassisNo;
  }

  const engineNo = toTrimmedString(vehicleInfo.engineNo);
  if (engineNo !== undefined) {
    data.engineNo = engineNo;
  }

  const brandId = await resolveVehicleBrandId(tx, vehicleInfo.make || vehicleInfo.brandName, actorUserId);
  if (brandId !== undefined) {
    data.brandId = brandId;
  }

  if (Object.keys(data).length > 0) {
    data.modifiedById = actorUserId || null;
  }

  return data;
};

const buildCustomerUpdateData = (customerInfo = {}, actorUserId) => {
  const data = {};
  const fullName = toTrimmedString(customerInfo.fullName || customerInfo.ownerName || customerInfo.name);
  const mobileNo = toTrimmedString(customerInfo.mobileNo || customerInfo.mobileNumber);
  const alternateMobileNo = toTrimmedString(customerInfo.alternateMobileNo || customerInfo.alternateNumber);
  const emailId = toTrimmedString(customerInfo.emailId || customerInfo.email);
  const addressParts = [
    toTrimmedString(customerInfo.address),
    toTrimmedString(customerInfo.city)
  ].filter(Boolean);

  if (fullName !== undefined) {
    data.fullName = fullName;
  }

  if (mobileNo !== undefined) {
    data.mobileNo = mobileNo;
  }

  if (alternateMobileNo !== undefined) {
    data.alternateMobileNo = alternateMobileNo;
  }

  if (emailId !== undefined) {
    data.emailId = emailId;
  }

  if (addressParts.length > 0) {
    data.address = addressParts.join(', ');
  } else if (customerInfo.address === null || customerInfo.address === '') {
    data.address = null;
  }

  if (Object.keys(data).length > 0) {
    data.modifiedById = actorUserId || null;
  }

  return data;
};

const buildBillingSummary = (billing = {}, serviceSubtotal) => {
  const discountAmount = Math.max(0, toOptionalNumber(billing.discountAmount ?? billing.discount) || 0);
  const taxRate = Math.max(0, toOptionalNumber(billing.taxRate) || 0);
  const taxAmount = Math.max(0, toOptionalNumber(billing.taxAmount) ?? ((serviceSubtotal * taxRate) / 100));
  const finalAmount = Math.max(0, toOptionalNumber(billing.finalAmount) ?? (serviceSubtotal + taxAmount - discountAmount));
  const discountReason = toTrimmedString(billing.discountReason);

  return {
    serviceSubtotal,
    taxRate,
    taxAmount,
    discountAmount,
    finalAmount,
    discountReason
  };
};

const buildAdditionalNotes = (payload) => toTrimmedString(payload.additionalNotes) || null;

const inferPhotoCategory = (file, index, photoCategories = []) => {
  const fieldCategory = Array.isArray(photoCategories) ? photoCategories[index] : null;
  const originalName = String(file.originalname || '').toLowerCase();

  if (fieldCategory) {
    return fieldCategory;
  }

  if (originalName.includes('front')) {
    return 'FRONT_VIEW';
  }

  if (originalName.includes('rear') || originalName.includes('back')) {
    return 'REAR_VIEW';
  }

  if (originalName.includes('left')) {
    return 'LEFT_SIDE';
  }

  if (originalName.includes('right')) {
    return 'RIGHT_SIDE';
  }

  return 'VEHICLE_PHOTO';
};

const cleanupLocalFiles = async (files) => {
  await Promise.all((files || []).map(async (file) => {
    if (!file.path) {
      return;
    }

    try {
      await fs.unlink(file.path);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn(`Unable to delete temp upload file: ${file.path}`);
      }
    }
  }));
};

const uploadVehiclePhotos = async (files = [], actorUserId, photoCategories = []) => {
  if (!files.length) {
    return [];
  }

  const storageProvider = createStorageProvider();
  const uploadedPhotos = [];

  try {
    for (const [index, file] of files.entries()) {
      const uploadResult = await storageProvider.upload(file.path, {
        folder: 'dvsos/job-cards/vehicle-photos',
        resource_type: 'image'
      });

      uploadedPhotos.push({
        uploadedById: actorUserId || null,
        fileType: 'IMAGE',
        category: String(inferPhotoCategory(file, index, photoCategories)).trim().toUpperCase().replace(/\s+/g, '_').slice(0, 50),
        fileName: file.originalname || null,
        fileUrl: uploadResult.secure_url || uploadResult.url,
        blobName: uploadResult.public_id || null,
        containerName: 'cloudinary',
        mimeType: file.mimetype || uploadResult.format || null,
        fileSizeKb: uploadResult.bytes ? Math.ceil(uploadResult.bytes / 1024) : Math.ceil((file.size || 0) / 1024),
        createdById: actorUserId || null
      });
    }

    return uploadedPhotos;
  } finally {
    await cleanupLocalFiles(files);
  }
};

const buildMediaRows = ({ uploadedPhotos = [], vehicleId }) => {
  return uploadedPhotos.map((photo) => ({
    moduleRecordId: vehicleId,
    moduleName: 'VEHICLE',
    ...photo
  }));
};

const createAudit = async (tx, { tableName, recordId, actionType, actorUserId, recordName, comments, locationId, details = [] }) => {
  if (!actorUserId) {
    return null;
  }

  return createAuditLog(tx, {
    moduleCode: 'job-card',
    moduleName: 'Job Card',
    tableName,
    recordId,
    actionType,
    performedByUserId: actorUserId,
    recordName,
    comments,
    locationId,
    details
  });
};

const pendingQueueSelect = {
  id: true,
  gateEntryNo: true,
  entryType: true,
  entryTime: true,
  customer: {
    select: {
      id: true,
      fullName: true,
      mobileNo: true,
      alternateMobileNo: true,
      emailId: true,
      address: true
    }
  },
  vehicle: {
    select: {
      id: true,
      registrationNo: true,
      model: true,
      variant: true,
      fuelType: true,
      vehicleColor: true,
      chassisNo: true,
      engineNo: true,
      brand: {
        select: {
          id: true,
          name: true
        }
      }
    }
  },
  location: {
    select: {
      id: true,
      locationCode: true,
      locationName: true
    }
  },
  jobCards: {
    select: {
      id: true,
      jobCardNo: true
    },
    take: 1
  }
};

const getElapsedMinutes = (date) => {
  if (!date) {
    return 0;
  }

  return Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 60000));
};

const toQueueEntryResponse = (entry) => ({
  id: entry.id,
  gateEntryId: entry.id,
  gateEntryNo: entry.gateEntryNo,
  entryType: String(entry.entryType || '').toLowerCase(),
  entryTime: entry.entryTime,
  waitingMinutes: getElapsedMinutes(entry.entryTime),
  customer: entry.customer
    ? {
      id: entry.customer.id,
      name: entry.customer.fullName,
      mobileNo: entry.customer.mobileNo,
      alternateMobileNo: entry.customer.alternateMobileNo,
      emailId: entry.customer.emailId,
      address: entry.customer.address
    }
    : null,
  vehicle: entry.vehicle
    ? {
      id: entry.vehicle.id,
      registrationNumber: entry.vehicle.registrationNo,
      model: entry.vehicle.model,
      make: entry.vehicle.brand ? entry.vehicle.brand.name : null,
      variant: entry.vehicle.variant,
      fuelType: entry.vehicle.fuelType,
      color: entry.vehicle.vehicleColor,
      chassisNo: entry.vehicle.chassisNo,
      engineNo: entry.vehicle.engineNo
    }
    : null,
  location: entry.location || null,
  canCreateJobCard: !entry.jobCards || entry.jobCards.length === 0
});

const jobCardListSelect = {
  id: true,
  jobCardNo: true,
  gateEntryId: true,
  expectedDeliveryAt: true,
  totalEstimate: true,
  serviceSubtotal: true,
  taxRate: true,
  taxAmount: true,
  discountAmount: true,
  finalAmount: true,
  discountReason: true,
  customerComplaint: true,
  additionalNotes: true,
  createdAt: true,
  updatedAt: true,
  location: {
    select: {
      id: true,
      locationCode: true,
      locationName: true
    }
  },
  gateEntry: {
    select: {
      id: true,
      gateEntryNo: true,
      entryTime: true
    }
  },
  createdBy: {
    select: {
      id: true,
      fullName: true,
      employeeCode: true
    }
  },
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
      mobileNo: true,
      alternateMobileNo: true,
      emailId: true,
      address: true
    }
  },
  vehicle: {
    select: {
      id: true,
      registrationNo: true,
      model: true,
      variant: true,
      fuelType: true,
      vehicleColor: true,
      chassisNo: true,
      engineNo: true,
      brand: {
        select: {
          id: true,
          name: true
        }
      }
    }
  },
  services: {
    select: {
      id: true,
      serviceItemId: true,
      serviceName: true,
      price: true,
      quantity: true,
      isAdditional: true
    },
    orderBy: {
      id: 'asc'
    }
  },
  _count: {
    select: {
      services: true
    }
  }
};

const toStatusResponse = (status) => {
  if (!status) {
    return null;
  }

  return {
    id: status.id,
    code: status.statusCode,
    name: status.statusName
  };
};

const toJobCardListResponse = (jobCard) => ({
  id: jobCard.id,
  jobCardNo: jobCard.jobCardNo,
  gateEntryId: jobCard.gateEntryId,
  gateEntry: jobCard.gateEntry
    ? {
      id: jobCard.gateEntry.id,
      gateEntryNo: jobCard.gateEntry.gateEntryNo,
      entryTime: jobCard.gateEntry.entryTime
    }
    : null,
  location: jobCard.location || null,
  createdBy: jobCard.createdBy
    ? {
      id: jobCard.createdBy.id,
      name: jobCard.createdBy.fullName,
      employeeCode: jobCard.createdBy.employeeCode
    }
    : null,
  expectedDeliveryAt: jobCard.expectedDeliveryAt,
  totalEstimate: Number(jobCard.totalEstimate),
  billing: {
    serviceSubtotal: jobCard.serviceSubtotal === null || jobCard.serviceSubtotal === undefined ? null : Number(jobCard.serviceSubtotal),
    taxRate: jobCard.taxRate === null || jobCard.taxRate === undefined ? null : Number(jobCard.taxRate),
    taxAmount: jobCard.taxAmount === null || jobCard.taxAmount === undefined ? null : Number(jobCard.taxAmount),
    discountAmount: jobCard.discountAmount === null || jobCard.discountAmount === undefined ? null : Number(jobCard.discountAmount),
    finalAmount: jobCard.finalAmount === null || jobCard.finalAmount === undefined ? null : Number(jobCard.finalAmount),
    discountReason: jobCard.discountReason || null
  },
  customerComplaint: jobCard.customerComplaint,
  additionalNotes: jobCard.additionalNotes,
  createdAt: jobCard.createdAt,
  updatedAt: jobCard.updatedAt,
  currentStatus: toStatusResponse(jobCard.currentStatus),
  approvalStatus: toStatusResponse(jobCard.approvalStatus),
  customer: jobCard.customer
    ? {
      id: jobCard.customer.id,
      name: jobCard.customer.fullName,
      mobileNo: jobCard.customer.mobileNo,
      alternateMobileNo: jobCard.customer.alternateMobileNo,
      emailId: jobCard.customer.emailId,
      address: jobCard.customer.address
    }
    : null,
  vehicle: jobCard.vehicle
    ? {
      id: jobCard.vehicle.id,
      registrationNumber: jobCard.vehicle.registrationNo,
      model: jobCard.vehicle.model,
      make: jobCard.vehicle.brand ? jobCard.vehicle.brand.name : null,
      variant: jobCard.vehicle.variant,
      fuelType: jobCard.vehicle.fuelType,
      color: jobCard.vehicle.vehicleColor,
      chassisNo: jobCard.vehicle.chassisNo,
      engineNo: jobCard.vehicle.engineNo
    }
    : null,
  serviceCount: jobCard._count ? jobCard._count.services : (jobCard.services || []).length,
  services: (jobCard.services || []).map((service) => ({
    id: service.id,
    serviceItemId: service.serviceItemId,
    name: service.serviceName,
    price: Number(service.price),
    quantity: service.quantity,
    isAdditional: service.isAdditional
  }))
});

const resolveCreatedByFilter = (query, user) => {
  const roleSlug = normalizeRoleSlug(user && user.roleSlug);

  if (roleSlug === 'crm_team') {
    return Number(user.userId);
  }

  return parsePositiveInt(query.createdById, Number(user && user.userId));
};

const buildJobCardListWhere = (query, user) => {
  const where = {};
  const locationId = resolveLocationFilter(query, user);
  const createdById = resolveCreatedByFilter(query, user);

  if (locationId) {
    where.locationId = locationId;
  }

  if (createdById) {
    where.createdById = createdById;
  }

  const customerName = toTrimmedString(query.customerName);
  if (customerName) {
    where.customer = {
      fullName: {
        contains: customerName
      }
    };
  }

  const vehicleNumber = toTrimmedString(query.vehicleNumber || query.registrationNo || query.registrationNumber);
  const normalizedVehicleNumber = vehicleNumber ? normalizeVehicleNumber(vehicleNumber) : null;
  if (normalizedVehicleNumber) {
    where.vehicle = {
      registrationNo: {
        contains: normalizedVehicleNumber
      }
    };
  }

  const fromDate = parseDateQuery(query.fromDate || query.createdFrom || query.createdAtFrom, 'fromDate');
  const toDate = parseDateQuery(query.toDate || query.createdTo || query.createdAtTo, 'toDate', true);
  if (fromDate && toDate && fromDate > toDate) {
    throw createHttpError(400, 'fromDate must be before or equal to toDate');
  }

  if (fromDate || toDate) {
    where.createdAt = {
      ...(fromDate ? { gte: fromDate } : {}),
      ...(toDate ? { lte: toDate } : {})
    };
  }

  const currentStatusCode = toTrimmedString(query.currentStatusCode || query.statusCode);
  if (currentStatusCode) {
    where.currentStatus = {
      is: {
        statusCode: currentStatusCode.toUpperCase()
      }
    };
  }

  const approvalStatusCode = toTrimmedString(query.approvalStatusCode);
  if (approvalStatusCode) {
    where.approvalStatus = {
      is: {
        statusCode: approvalStatusCode.toUpperCase()
      }
    };
  }

  const search = String(query.search || '').trim();
  if (search) {
    const normalizedSearch = normalizeVehicleNumber(search);
    where.OR = [
      {
        jobCardNo: {
          contains: search
        }
      },
      {
        gateEntry: {
          gateEntryNo: {
            contains: search
          }
        }
      },
      ...(normalizedSearch
        ? [
          {
            vehicle: {
              registrationNo: {
                contains: normalizedSearch
              }
            }
          }
        ]
        : []),
      {
        customer: {
          fullName: {
            contains: search
          }
        }
      },
      {
        customer: {
          mobileNo: {
            contains: search
          }
        }
      }
    ];
  }

  return where;
};

const buildQueueWhere = (query, user) => {
  const where = {
    exitTime: null,
    jobCards: {
      none: {}
    }
  };

  const locationId = resolveLocationFilter(query, user);
  if (locationId) {
    where.locationId = locationId;
  }

  if (query.entryType && String(query.entryType).trim().toLowerCase() !== 'all') {
    where.entryType = String(query.entryType).trim().toUpperCase();
  }

  const search = String(query.search || '').trim();
  if (search) {
    const normalizedSearch = normalizeVehicleNumber(search);
    where.OR = [
      ...(normalizedSearch
        ? [
          {
            vehicle: {
              registrationNo: {
                contains: normalizedSearch
              }
            }
          }
        ]
        : []),
      {
        customer: {
          fullName: {
            contains: search
          }
        }
      },
      {
        customer: {
          mobileNo: {
            contains: search
          }
        }
      }
    ];
  }

  return where;
};

const jobCardList = async (query, user) => {
  const page = parsePositiveInt(query.page, 1);
  const limit = parsePositiveInt(query.limit, 10);
  const where = buildJobCardListWhere(query, user);
  const activeWhere = {
    AND: [
      where,
      {
        OR: [
          {
            currentStatusId: null
          },
          {
            currentStatus: {
              is: {
                statusCode: {
                  notIn: ['DELIVERED', 'REJECTED']
                }
              }
            }
          }
        ]
      }
    ]
  };

  const [jobCards, total, activeCount] = await prisma.$transaction([
    prisma.jobCard.findMany({
      where,
      select: jobCardListSelect,
      orderBy: {
        createdAt: 'desc'
      },
      skip: (page - 1) * limit,
      take: limit
    }),
    prisma.jobCard.count({ where }),
    prisma.jobCard.count({ where: activeWhere })
  ]);

  return {
    jobCards: jobCards.map(toJobCardListResponse),
    summary: {
      total,
      active: activeCount,
      completed: Math.max(0, total - activeCount)
    },
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
};

const pendingQueue = async (query, user) => {
  const page = parsePositiveInt(query.page, 1);
  const limit = parsePositiveInt(query.limit, 10);
  const where = buildQueueWhere(query, user);
  const activeWhere = {
    ...(where.locationId ? { locationId: where.locationId } : {}),
    OR: [
      {
        currentStatusId: null
      },
      {
        currentStatus: {
          is: {
            statusCode: {
              notIn: ['DELIVERED', 'REJECTED']
            }
          }
        }
      }
    ]
  };

  const [entries, total, waitingCount, activeCount] = await prisma.$transaction([
    prisma.gateEntry.findMany({
      where,
      select: pendingQueueSelect,
      orderBy: {
        entryTime: 'asc'
      },
      skip: (page - 1) * limit,
      take: limit
    }),
    prisma.gateEntry.count({ where }),
    prisma.gateEntry.count({ where }),
    prisma.jobCard.count({ where: activeWhere })
  ]);

  return {
    entries: entries.map(toQueueEntryResponse),
    summary: {
      totalQueue: waitingCount + activeCount,
      waiting: waitingCount,
      active: activeCount
    },
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
};

const detailSelect = {
  ...pendingQueueSelect,
  remarks: true
};

const queueDetail = async (id, user) => {
  const gateEntryId = Number(id);
  const where = {
    id: gateEntryId,
    ...(user && user.locationId ? { locationId: Number(user.locationId) } : {})
  };

  const gateEntry = await prisma.gateEntry.findFirst({
    where,
    select: detailSelect
  });

  if (!gateEntry) {
    throw createHttpError(404, 'Gate entry not found');
  }

  return {
    entry: {
      ...toQueueEntryResponse(gateEntry),
      remarks: gateEntry.remarks || null
    }
  };
};

const normalizeServiceItems = (serviceItems) => {
  const itemMap = new Map();

  serviceItems.forEach((item) => {
    const serviceItemId = Number(typeof item === 'object' ? item.serviceItemId : item);
    const quantity = Number(typeof item === 'object' && item.quantity !== undefined ? item.quantity : 1);
    itemMap.set(serviceItemId, (itemMap.get(serviceItemId) || 0) + quantity);
  });

  return Array.from(itemMap.entries()).map(([serviceItemId, quantity]) => ({
    serviceItemId,
    quantity
  }));
};

const toJobCardResponse = (jobCard) => ({
  id: jobCard.id,
  jobCardNo: jobCard.jobCardNo,
  gateEntryId: jobCard.gateEntryId,
  expectedDeliveryAt: jobCard.expectedDeliveryAt,
  totalEstimate: Number(jobCard.totalEstimate),
  billing: {
    serviceSubtotal: jobCard.serviceSubtotal === null || jobCard.serviceSubtotal === undefined ? null : Number(jobCard.serviceSubtotal),
    taxRate: jobCard.taxRate === null || jobCard.taxRate === undefined ? null : Number(jobCard.taxRate),
    taxAmount: jobCard.taxAmount === null || jobCard.taxAmount === undefined ? null : Number(jobCard.taxAmount),
    discountAmount: jobCard.discountAmount === null || jobCard.discountAmount === undefined ? null : Number(jobCard.discountAmount),
    finalAmount: jobCard.finalAmount === null || jobCard.finalAmount === undefined ? null : Number(jobCard.finalAmount),
    discountReason: jobCard.discountReason || null
  },
  customerComplaint: jobCard.customerComplaint,
  additionalNotes: jobCard.additionalNotes,
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
    : null,
  customer: jobCard.customer
    ? {
      id: jobCard.customer.id,
      name: jobCard.customer.fullName,
      mobileNo: jobCard.customer.mobileNo,
      alternateMobileNo: jobCard.customer.alternateMobileNo,
      emailId: jobCard.customer.emailId,
      address: jobCard.customer.address
    }
    : null,
  vehicle: jobCard.vehicle
    ? {
      id: jobCard.vehicle.id,
      registrationNumber: jobCard.vehicle.registrationNo,
      model: jobCard.vehicle.model,
      make: jobCard.vehicle.brand ? jobCard.vehicle.brand.name : null,
      variant: jobCard.vehicle.variant,
      fuelType: jobCard.vehicle.fuelType,
      color: jobCard.vehicle.vehicleColor,
      chassisNo: jobCard.vehicle.chassisNo,
      engineNo: jobCard.vehicle.engineNo
    }
    : null,
  services: (jobCard.services || []).map((service) => ({
    id: service.id,
    serviceItemId: service.serviceItemId,
    name: service.serviceName,
    price: Number(service.price),
    quantity: service.quantity,
    isAdditional: service.isAdditional
  }))
});

const createFromGateEntry = async (payload, user, files = []) => {
  const gateEntryId = Number(payload.gateEntryId);
  const expectedDeliveryAt = new Date(payload.expectedDeliveryAt);
  const normalizedServiceItems = normalizeServiceItems(payload.serviceItems);

  const gateEntry = await prisma.gateEntry.findFirst({
    where: {
      id: gateEntryId,
      exitTime: null,
      ...(user && user.locationId ? { locationId: Number(user.locationId) } : {})
    },
    select: {
      id: true,
      gateEntryNo: true,
      locationId: true,
      customerId: true,
      vehicleId: true,
      jobCards: {
        select: {
          id: true,
          jobCardNo: true
        },
        take: 1
      }
    }
  });

  if (!gateEntry) {
    throw createHttpError(404, 'Active gate entry not found');
  }

  if (gateEntry.jobCards.length > 0) {
    throw createHttpError(409, 'Job card is already created for this gate entry', {
      jobCard: gateEntry.jobCards[0]
    });
  }

  const serviceItemIds = normalizedServiceItems.map((item) => item.serviceItemId);
  const serviceItems = await prisma.serviceItem.findMany({
    where: {
      id: {
        in: serviceItemIds
      },
      isActive: true,
      category: {
        isActive: true
      }
    },
    select: {
      id: true,
      name: true,
      defaultPrice: true
    }
  });

  if (serviceItems.length !== serviceItemIds.length) {
    throw createHttpError(400, 'One or more service items are invalid or inactive');
  }

  const serviceItemMap = new Map(serviceItems.map((item) => [item.id, item]));
  const serviceSubtotal = normalizedServiceItems.reduce((sum, item) => {
    const serviceItem = serviceItemMap.get(item.serviceItemId);
    return sum + (Number(serviceItem.defaultPrice) * item.quantity);
  }, 0);
  const billingSummary = buildBillingSummary(payload.billing, serviceSubtotal);
  const uploadedPhotos = await uploadVehiclePhotos(files, user.userId, payload.photoCategories);

  return prisma.$transaction(async (tx) => {
    const existingJobCard = await tx.jobCard.findFirst({
      where: { gateEntryId: gateEntry.id },
      select: {
        id: true,
        jobCardNo: true
      }
    });

    if (existingJobCard) {
      throw createHttpError(409, 'Job card is already created for this gate entry', {
        jobCard: existingJobCard
      });
    }

    const vehicleUpdateData = await buildVehicleUpdateData(tx, payload.vehicleInfo, user.userId);
    if (vehicleUpdateData.registrationNo) {
      const duplicateVehicle = await tx.vehicle.findFirst({
        where: {
          registrationNo: vehicleUpdateData.registrationNo,
          id: {
            not: gateEntry.vehicleId
          }
        },
        select: { id: true }
      });

      if (duplicateVehicle) {
        throw createHttpError(409, 'Vehicle number already exists for another vehicle');
      }
    }

    if (Object.keys(vehicleUpdateData).length > 0) {
      await tx.vehicle.update({
        where: { id: gateEntry.vehicleId },
        data: vehicleUpdateData
      });
    }

    const customerUpdateData = buildCustomerUpdateData(payload.customerInfo, user.userId);
    if (Object.keys(customerUpdateData).length > 0) {
      await tx.customer.update({
        where: { id: gateEntry.customerId },
        data: customerUpdateData
      });
    }

    const currentStatusId = await resolveStatusId(tx, JOB_CARD_CREATED_STATUS_CODES);
    const jobCardNo = await generateJobCardNo(tx);
    const jobCardSlug = await createUniqueSlug(tx, 'jobCard', jobCardNo);
    const additionalNotes = buildAdditionalNotes(payload);

    const jobCard = await tx.jobCard.create({
      data: {
        locationId: gateEntry.locationId,
        jobCardNo,
        slug: jobCardSlug,
        gateEntryId: gateEntry.id,
        customerId: gateEntry.customerId,
        vehicleId: gateEntry.vehicleId,
        expectedDeliveryAt,
        currentStatusId,
        totalEstimate: billingSummary.finalAmount,
        serviceSubtotal: billingSummary.serviceSubtotal,
        taxRate: billingSummary.taxRate,
        taxAmount: billingSummary.taxAmount,
        discountAmount: billingSummary.discountAmount,
        finalAmount: billingSummary.finalAmount,
        discountReason: billingSummary.discountReason,
        customerComplaint: payload.customerComplaint ? String(payload.customerComplaint).trim() : null,
        additionalNotes,
        createdById: user.userId || null
      },
      select: {
        id: true,
        jobCardNo: true
      }
    });

    await tx.jobCardService.createMany({
      data: normalizedServiceItems.map((item) => {
        const serviceItem = serviceItemMap.get(item.serviceItemId);

        return {
          jobCardId: jobCard.id,
          serviceItemId: serviceItem.id,
          serviceName: serviceItem.name,
          price: Number(serviceItem.defaultPrice),
          quantity: item.quantity,
          isAdditional: false,
          createdById: user.userId || null
        };
      })
    });

    const mediaRows = buildMediaRows({
      uploadedPhotos,
      vehicleId: gateEntry.vehicleId,
      actorUserId: user.userId
    });

    if (mediaRows.length > 0) {
      await tx.mediaFile.createMany({
        data: mediaRows
      });
    }

    await tx.jobCardStatusLog.create({
      data: {
        jobCardId: jobCard.id,
        statusId: currentStatusId,
        changedById: user.userId || null,
        remarks: 'Job card created from gate entry'
      }
    });

    await createAudit(tx, {
      tableName: 'job_cards',
      recordId: jobCard.id,
      actionType: 'CREATE',
      actorUserId: user.userId,
      recordName: jobCard.jobCardNo,
      comments: 'Job card created from mobile job card app',
      locationId: gateEntry.locationId,
      details: [
        { fieldName: 'gateEntryNo', oldValue: null, newValue: gateEntry.gateEntryNo, dataType: 'string' },
        { fieldName: 'totalEstimate', oldValue: null, newValue: billingSummary.finalAmount, dataType: 'number' }
      ]
    });

    const createdJobCard = await tx.jobCard.findUnique({
      where: {
        id: jobCard.id
      },
      select: {
        id: true,
        jobCardNo: true,
        gateEntryId: true,
        expectedDeliveryAt: true,
        totalEstimate: true,
        serviceSubtotal: true,
        taxRate: true,
        taxAmount: true,
        discountAmount: true,
        finalAmount: true,
        discountReason: true,
        customerComplaint: true,
        additionalNotes: true,
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
            mobileNo: true,
            alternateMobileNo: true,
            emailId: true,
            address: true
          }
        },
        vehicle: {
          select: {
            id: true,
            registrationNo: true,
            model: true,
            variant: true,
            fuelType: true,
            vehicleColor: true,
            chassisNo: true,
            engineNo: true,
            brand: {
              select: {
                id: true,
                name: true
              }
            }
          }
        },
        services: {
          select: {
            id: true,
            serviceItemId: true,
            serviceName: true,
            price: true,
            quantity: true,
            isAdditional: true
          }
        }
      }
    });

    return {
      jobCard: toJobCardResponse(createdJobCard),
      billing: billingSummary,
      media: {
        photos: mediaRows.map((row) => ({
          category: row.category,
          fileUrl: row.fileUrl,
          fileName: row.fileName
        }))
      },
      nextAction: 'JOB_CARD_CREATED'
    };
  });
};

module.exports = {
  pendingQueue,
  jobCardList,
  queueDetail,
  createFromGateEntry
};
