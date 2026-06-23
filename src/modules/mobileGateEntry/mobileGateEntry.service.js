const prisma = require('../../config/db');
const { createAuditLog } = require('../../common/utils/audit.util');
const { generateSlug, generateUniqueSlug } = require('../../common/utils/slug.util');
const { normalizeVehicleNumber } = require('../../utils/normalizeVehicleNumber');
const { generateGateEntryNo } = require('../../utils/generateGateEntryNo');
const { indianMobileRegex } = require('./mobileGateEntry.validation');

const ENTRY_STATUS_CODES = ['ACTIVE', 'OPEN', 'ENTERED', 'ENTRY_CREATED'];
const EXIT_STATUS_CODES = ['EXITED', 'CLOSED'];
const ENTRY_TYPE_MAP = {
  service: 'SERVICE',
  pickup: 'PICKUP',
  enquiry: 'ENQUIRY'
};

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

const parseDate = (value, endOfDay = false) => {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  if (endOfDay) {
    date.setHours(23, 59, 59, 999);
  } else {
    date.setHours(0, 0, 0, 0);
  }

  return date;
};

const normalizeRegistrationOrThrow = (registrationNumber) => {
  const normalizedRegistrationNumber = normalizeVehicleNumber(registrationNumber);

  if (!normalizedRegistrationNumber) {
    throw createHttpError(400, 'registrationNumber is required');
  }

  if (normalizedRegistrationNumber.length < 6) {
    throw createHttpError(400, 'normalized registration number must be at least 6 characters');
  }

  return normalizedRegistrationNumber;
};

const normalizeRoleSlug = (slug) => String(slug || '').trim().toLowerCase().replace(/-/g, '_');
const isAdmin = (user) => user && ['admin', 'super_admin'].includes(normalizeRoleSlug(user.roleSlug));
const isGateSecurity = (user) => user && ['gate_security', 'gatekeeper'].includes(normalizeRoleSlug(user.roleSlug));
const isLocationScopedViewer = (user) => {
  return ['gate_security', 'gatekeeper', 'crm_team', 'manager', 'managing_director'].includes(normalizeRoleSlug(user && user.roleSlug));
};

const resolveLocationId = (payload, user, { allowAdminBody = false } = {}) => {
  if (isGateSecurity(user)) {
    if (!user.locationId) {
      throw createHttpError(400, 'Gate security user must be assigned to a location');
    }

    return Number(user.locationId);
  }

  if (allowAdminBody && isAdmin(user) && payload.locationId) {
    const locationId = Number(payload.locationId);

    if (!Number.isInteger(locationId) || locationId <= 0) {
      throw createHttpError(400, 'Valid locationId is required');
    }

    return locationId;
  }

  if (user.locationId) {
    return Number(user.locationId);
  }

  throw createHttpError(400, 'locationId is required');
};

const ensureActiveLocation = async (locationId) => {
  const location = await prisma.location.findFirst({
    where: {
      id: locationId,
      isActive: true
    },
    select: {
      id: true,
      locationCode: true,
      locationName: true
    }
  });

  if (!location) {
    throw createHttpError(400, 'Invalid or inactive location');
  }

  return location;
};

const findVehicleByRegistration = (registrationNo) => {
  return prisma.vehicle.findUnique({
    where: { registrationNo },
    select: {
      id: true,
      registrationNo: true,
      customerId: true,
      customer: {
        select: {
          id: true,
          fullName: true,
          mobileNo: true
        }
      }
    }
  });
};

const findActiveGateEntry = (vehicleId, locationId) => {
  return prisma.gateEntry.findFirst({
    where: {
      vehicleId,
      exitTime: null,
      ...(locationId ? { locationId } : {})
    },
    orderBy: {
      entryTime: 'desc'
    },
    select: gateEntrySelect
  });
};

const gateEntrySelect = {
  id: true,
  gateEntryNo: true,
  entryType: true,
  entryTime: true,
  exitTime: true,
  remarks: true,
  status: {
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
      registrationNo: true
    }
  },
  location: {
    select: {
      id: true,
      locationCode: true,
      locationName: true
    }
  }
};

const toCustomerResponse = (customer) => {
  if (!customer) {
    return null;
  }

  return {
    id: customer.id,
    name: customer.fullName,
    mobileNo: customer.mobileNo
  };
};

const toVehicleResponse = (vehicle) => ({
  id: vehicle.id,
  registrationNumber: vehicle.registrationNo
});

const toGateEntryResponse = (entry) => {
  if (!entry) {
    return null;
  }

  return {
    id: entry.id,
    gateEntryNo: entry.gateEntryNo,
    entryType: String(entry.entryType || '').toLowerCase(),
    entryTime: entry.entryTime,
    exitTime: entry.exitTime,
    remarks: entry.remarks,
    status: entry.status
      ? {
        id: entry.status.id,
        code: entry.status.statusCode,
        name: entry.status.statusName
      }
      : null,
    customer: toCustomerResponse(entry.customer),
    vehicle: entry.vehicle ? toVehicleResponse(entry.vehicle) : null,
    location: entry.location || null
  };
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

const createAudit = async (tx, { tableName, recordId, actionType, actorUserId, recordName, comments, locationId, details = [] }) => {
  if (!actorUserId) {
    return null;
  }

  return createAuditLog(tx, {
    moduleCode: 'gate-entry',
    moduleName: 'Gate Entry',
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

const checkVehicle = async ({ registrationNumber }, user) => {
  const normalizedRegistrationNumber = normalizeRegistrationOrThrow(registrationNumber);
  const locationId = isGateSecurity(user) ? resolveLocationId({}, user) : null;
  const vehicle = await findVehicleByRegistration(normalizedRegistrationNumber);

  if (!vehicle) {
    return {
      isExistingVehicle: false,
      normalizedRegistrationNumber,
      requiredFields: ['whatsappNumber'],
      nextAction: 'CREATE_ENTRY'
    };
  }

  const activeGateEntry = await findActiveGateEntry(vehicle.id, locationId);

  return {
    isExistingVehicle: true,
    normalizedRegistrationNumber,
    vehicle: toVehicleResponse(vehicle),
    customer: toCustomerResponse(vehicle.customer),
    activeGateEntry: activeGateEntry ? toGateEntryResponse(activeGateEntry) : null,
    nextAction: activeGateEntry ? 'EXIT' : 'CREATE_ENTRY'
  };
};

const createGateEntry = async (payload, user) => {
  const normalizedRegistrationNumber = normalizeRegistrationOrThrow(payload.registrationNumber);
  const normalizedEntryType = String(payload.entryType || '').trim().toLowerCase();
  const entryType = ENTRY_TYPE_MAP[normalizedEntryType];

  if (!entryType) {
    throw createHttpError(400, 'entryType must be service, pickup, or enquiry');
  }

  const locationId = resolveLocationId(payload, user, { allowAdminBody: true });
  const location = await ensureActiveLocation(locationId);
  const existingVehicle = await findVehicleByRegistration(normalizedRegistrationNumber);

  if (existingVehicle) {
    if (!existingVehicle.customerId || !existingVehicle.customer) {
      throw createHttpError(
        409,
        'Existing vehicle does not have a valid customer mapping. Ask CRM/admin to fix vehicle-customer mapping.',
        {
          normalizedRegistrationNumber,
          vehicle: toVehicleResponse(existingVehicle),
          nextAction: 'FIX_VEHICLE_CUSTOMER_MAPPING'
        }
      );
    }

    const activeGateEntry = await findActiveGateEntry(existingVehicle.id);

    if (activeGateEntry) {
      throw createHttpError(
        409,
        'Active gate entry already exists for this vehicle. Submit exit first.',
        {
          normalizedRegistrationNumber,
          vehicle: toVehicleResponse(existingVehicle),
          activeGateEntry: toGateEntryResponse(activeGateEntry),
          nextAction: 'EXIT'
        }
      );
    }
  }

  if (!existingVehicle) {
    const whatsappNumber = String(payload.whatsappNumber || '').trim();

    if (!indianMobileRegex.test(whatsappNumber)) {
      throw createHttpError(400, 'whatsappNumber is required for new vehicle and must be a valid 10 digit India mobile number');
    }
  }

  return prisma.$transaction(async (tx) => {
    let customer = existingVehicle ? existingVehicle.customer : null;
    let vehicle = existingVehicle;
    let isNewCustomer = false;
    let isNewVehicle = false;

    if (!vehicle) {
      const whatsappNumber = String(payload.whatsappNumber || '').trim();
      const customerName = `Gate Customer ${whatsappNumber}`;
      const customerSlug = await createUniqueSlug(tx, 'customer', customerName);

      customer = await tx.customer.create({
        data: {
          locationId,
          slug: customerSlug,
          fullName: customerName,
          mobileNo: whatsappNumber,
          createdById: user.userId || null
        },
        select: {
          id: true,
          fullName: true,
          mobileNo: true
        }
      });
      isNewCustomer = true;

      await createAudit(tx, {
        tableName: 'customers',
        recordId: customer.id,
        actionType: 'CREATE',
        actorUserId: user.userId,
        recordName: customer.fullName,
        comments: 'Customer created from gate entry',
        locationId,
        details: [
          { fieldName: 'mobileNo', oldValue: null, newValue: customer.mobileNo, dataType: 'string' }
        ]
      });

      const vehicleSlug = await createUniqueSlug(tx, 'vehicle', normalizedRegistrationNumber);
      vehicle = await tx.vehicle.create({
        data: {
          locationId,
          customerId: customer.id,
          slug: vehicleSlug,
          registrationNo: normalizedRegistrationNumber,
          createdById: user.userId || null
        },
        select: {
          id: true,
          registrationNo: true,
          customerId: true
        }
      });
      isNewVehicle = true;

      await createAudit(tx, {
        tableName: 'vehicles',
        recordId: vehicle.id,
        actionType: 'CREATE',
        actorUserId: user.userId,
        recordName: vehicle.registrationNo,
        comments: 'Vehicle created from gate entry',
        locationId,
        details: [
          { fieldName: 'registrationNo', oldValue: null, newValue: vehicle.registrationNo, dataType: 'string' }
        ]
      });
    }

    const entryStatusId = await resolveStatusId(tx, ENTRY_STATUS_CODES);
    const gateEntryNo = await generateGateEntryNo({ tx, locationCode: location.locationCode });
    const gateEntrySlug = await createUniqueSlug(tx, 'gateEntry', gateEntryNo);
    const gateEntry = await tx.gateEntry.create({
      data: {
        locationId,
        statusId: entryStatusId,
        entryType,
        gateEntryNo,
        slug: gateEntrySlug,
        customerId: customer.id,
        vehicleId: vehicle.id,
        entryTime: new Date(),
        enteredById: user.userId || null,
        remarks: payload.remarks ? String(payload.remarks).trim() : null,
        createdById: user.userId || null
      },
      select: {
        id: true,
        gateEntryNo: true
      }
    });

    await createAudit(tx, {
      tableName: 'gate_entries',
      recordId: gateEntry.id,
      actionType: 'CREATE',
      actorUserId: user.userId,
      recordName: gateEntry.gateEntryNo,
      comments: 'Gate entry created',
      locationId,
      details: [
        { fieldName: 'registrationNo', oldValue: null, newValue: normalizedRegistrationNumber, dataType: 'string' },
        { fieldName: 'entryType', oldValue: null, newValue: entryType, dataType: 'string' }
      ]
    });

    return {
      gateEntryId: gateEntry.id,
      gateEntryNo: gateEntry.gateEntryNo,
      normalizedRegistrationNumber,
      isNewCustomer,
      isNewVehicle,
      nextAction: 'WAITING_FOR_CRM'
    };
  });
};

const submitExit = async (id, payload, user) => {
  const gateEntryId = Number(id);
  const where = {
    id: gateEntryId,
    ...(isGateSecurity(user) ? { locationId: resolveLocationId({}, user) } : {})
  };

  const currentEntry = await prisma.gateEntry.findFirst({
    where,
    select: {
      id: true,
      gateEntryNo: true,
      locationId: true,
      exitTime: true
    }
  });

  if (!currentEntry) {
    throw createHttpError(404, 'Gate entry not found');
  }

  if (currentEntry.exitTime) {
    throw createHttpError(409, 'Gate entry exit is already submitted');
  }

  return prisma.$transaction(async (tx) => {
    const exitStatusId = await resolveStatusId(tx, EXIT_STATUS_CODES);
    const gateEntry = await tx.gateEntry.update({
      where: { id: gateEntryId },
      data: {
        exitTime: new Date(),
        ...(exitStatusId ? { statusId: exitStatusId } : {}),
        ...(payload.remarks ? { remarks: String(payload.remarks).trim() } : {}),
        modifiedById: user.userId || null
      },
      select: gateEntrySelect
    });

    await createAudit(tx, {
      tableName: 'gate_entries',
      recordId: gateEntry.id,
      actionType: 'UPDATE',
      actorUserId: user.userId,
      recordName: gateEntry.gateEntryNo,
      comments: 'Gate entry exited',
      locationId: gateEntry.location.id,
      details: [
        { fieldName: 'exitTime', oldValue: null, newValue: gateEntry.exitTime, dataType: 'date' }
      ]
    });

    return {
      gateEntry: toGateEntryResponse(gateEntry),
      nextAction: 'EXIT_SUBMITTED'
    };
  });
};

const buildHistoryWhere = (query, user) => {
  const where = {};
  const fromDate = parseDate(query.fromDate);
  const toDate = parseDate(query.toDate, true);

  if (fromDate || toDate) {
    where.entryTime = {
      ...(fromDate ? { gte: fromDate } : {}),
      ...(toDate ? { lte: toDate } : {})
    };
  }

  if (query.entryType) {
    const entryType = ENTRY_TYPE_MAP[String(query.entryType).trim().toLowerCase()];
    if (entryType) {
      where.entryType = entryType;
    }
  }

  if (query.registrationNumber) {
    where.vehicle = {
      registrationNo: normalizeRegistrationOrThrow(query.registrationNumber)
    };
  }

  if (isLocationScopedViewer(user)) {
    if (!user.locationId) {
      throw createHttpError(400, 'Location is required for this role');
    }
    where.locationId = resolveLocationId({}, user);
  } else if (query.locationId) {
    where.locationId = parsePositiveInt(query.locationId, undefined);
  } else if (user.locationId) {
    where.locationId = Number(user.locationId);
  }

  return where;
};

const history = async (query, user) => {
  const page = parsePositiveInt(query.page, 1);
  const limit = parsePositiveInt(query.limit, 10);
  const where = buildHistoryWhere(query, user);

  const [entries, total] = await prisma.$transaction([
    prisma.gateEntry.findMany({
      where,
      select: gateEntrySelect,
      orderBy: {
        entryTime: 'desc'
      },
      skip: (page - 1) * limit,
      take: limit
    }),
    prisma.gateEntry.count({ where })
  ]);

  return {
    entries: entries.map(toGateEntryResponse),
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
};

const activeByVehicle = async ({ registrationNumber }, user) => {
  const normalizedRegistrationNumber = normalizeRegistrationOrThrow(registrationNumber);
  const vehicle = await findVehicleByRegistration(normalizedRegistrationNumber);

  if (!vehicle) {
    return {
      normalizedRegistrationNumber,
      activeGateEntry: null,
      nextAction: 'CREATE_ENTRY'
    };
  }

  const activeGateEntry = await findActiveGateEntry(vehicle.id, isGateSecurity(user) ? resolveLocationId({}, user) : null);

  return {
    normalizedRegistrationNumber,
    vehicle: toVehicleResponse(vehicle),
    activeGateEntry: toGateEntryResponse(activeGateEntry),
    nextAction: activeGateEntry ? 'EXIT' : 'CREATE_ENTRY'
  };
};

const pendingCrmEntries = async (query, user) => {
  const page = parsePositiveInt(query.page, 1);
  const limit = parsePositiveInt(query.limit, 10);
  const where = {
    jobCards: {
      none: {}
    }
  };
  const fromDate = parseDate(query.date);

  if (fromDate) {
    where.entryTime = {
      gte: fromDate,
      lte: parseDate(query.date, true)
    };
  }

  if (query.registrationNumber) {
    where.vehicle = {
      registrationNo: normalizeRegistrationOrThrow(query.registrationNumber)
    };
  }

  const queryLocationId = parsePositiveInt(query.locationId, undefined);
  if (isLocationScopedViewer(user)) {
    if (!user.locationId) {
      throw createHttpError(400, 'Location is required for this role');
    }
    where.locationId = Number(user.locationId);
  } else if (user.locationId) {
    where.locationId = Number(user.locationId);
  } else if (queryLocationId) {
    where.locationId = queryLocationId;
  }

  const [entries, total] = await prisma.$transaction([
    prisma.gateEntry.findMany({
      where,
      select: gateEntrySelect,
      orderBy: {
        entryTime: 'desc'
      },
      skip: (page - 1) * limit,
      take: limit
    }),
    prisma.gateEntry.count({ where })
  ]);

  return {
    entries: entries.map(toGateEntryResponse),
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
};

module.exports = {
  checkVehicle,
  createGateEntry,
  submitExit,
  history,
  activeByVehicle,
  pendingCrmEntries
};
