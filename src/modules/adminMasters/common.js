const prisma = require('../../config/db');
const { apiResponse } = require('../../common/utils/apiResponse');
const { generateSlug, generateUniqueSlug } = require('../../common/utils/slug.util');
const { buildChangeDetails, createAuditLog } = require('../../common/utils/audit.util');
const { authMiddleware } = require('../../common/middleware/auth.middleware');
const { roleMiddleware } = require('../../common/middleware/role.middleware');
const { permissionMiddleware } = require('../../common/middleware/permission.middleware');

const createHttpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const parseBooleanFilter = (value) => {
  if (value === undefined || value === '') {
    return undefined;
  }

  if (value === true || value === 'true') {
    return true;
  }

  if (value === false || value === 'false') {
    return false;
  }

  return undefined;
};

const normalizeNullableString = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
};

const normalizeRequiredString = (value) => String(value || '').trim();

const normalizeOptionalInt = (value) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  return Number(value);
};

const normalizeDecimal = (value) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  return String(value);
};

const buildWhere = ({ search, searchFields = [], filters = {}, isActive }) => {
  const where = {};

  if (typeof isActive === 'boolean') {
    where.isActive = isActive;
  }

  Object.entries(filters).forEach(([fieldName, value]) => {
    if (value !== undefined) {
      where[fieldName] = value;
    }
  });

  if (search && searchFields.length > 0) {
    where.OR = searchFields.map((fieldName) => ({
      [fieldName]: { contains: search }
    }));
  }

  return where;
};

const pickData = (payload, fields) => {
  const data = {};

  fields.forEach((field) => {
    if (!Object.prototype.hasOwnProperty.call(payload, field.name)) {
      if (field.defaultValue !== undefined) {
        data[field.name] = field.defaultValue;
      }
      return;
    }

    const value = payload[field.name];

    if (field.type === 'string') {
      data[field.name] = field.required ? normalizeRequiredString(value) : normalizeNullableString(value);
      return;
    }

    if (field.type === 'int') {
      data[field.name] = Number(value);
      return;
    }

    if (field.type === 'optionalInt') {
      data[field.name] = normalizeOptionalInt(value);
      return;
    }

    if (field.type === 'decimal') {
      data[field.name] = normalizeDecimal(value);
      return;
    }

    if (field.type === 'boolean') {
      data[field.name] = value;
    }
  });

  return data;
};

const ensureExists = async ({ model, id, label }) => {
  const record = await prisma[model].findUnique({ where: { id } });

  if (!record) {
    throw createHttpError(404, `${label} not found`);
  }

  return record;
};

const ensureForeignKey = async ({ model, id, label }) => {
  if (id === undefined || id === null) {
    return null;
  }

  const record = await prisma[model].findUnique({
    where: { id },
    select: { id: true }
  });

  if (!record) {
    throw createHttpError(400, `${label} must reference an existing record`);
  }

  return record;
};

const ensureUniqueField = async ({ model, fieldName, value, label, excludeId }) => {
  if (value === undefined || value === null || value === '') {
    return;
  }

  const record = await prisma[model].findFirst({
    where: {
      [fieldName]: value,
      ...(excludeId ? { id: { not: excludeId } } : {})
    },
    select: { id: true }
  });

  if (record) {
    throw createHttpError(409, `${label} already exists`);
  }
};

const ensureUniqueComposite = async ({ model, fields, label, excludeId }) => {
  const record = await prisma[model].findFirst({
    where: {
      ...fields,
      ...(excludeId ? { id: { not: excludeId } } : {})
    },
    select: { id: true }
  });

  if (record) {
    throw createHttpError(409, `${label} already exists`);
  }
};

const resolveSlug = async ({ model, source, excludeId }) => {
  const baseSlug = generateSlug(source);

  if (!baseSlug) {
    throw createHttpError(400, 'Valid slug could not be generated');
  }

  return generateUniqueSlug(baseSlug, (slug) => {
    return prisma[model].findFirst({
      where: {
        slug,
        ...(excludeId ? { id: { not: excludeId } } : {})
      },
      select: { id: true }
    });
  });
};

const createAdminMasterService = (config) => {
  const validateRelations = async (data) => {
    if (config.validateRelations) {
      await config.validateRelations(data);
      return;
    }

    for (const relation of config.relations || []) {
      await ensureForeignKey({
        model: relation.model,
        id: data[relation.fieldName],
        label: relation.label
      });
    }
  };

  const validateUnique = async (data, excludeId) => {
    for (const unique of config.uniqueFields || []) {
      await ensureUniqueField({
        model: config.model,
        fieldName: unique.fieldName,
        value: data[unique.fieldName],
        label: unique.label,
        excludeId
      });
    }

    if (config.validateUnique) {
      await config.validateUnique(data, excludeId);
    }
  };

  const createRecord = async (payload, actorUserId) => {
    const data = pickData(payload, config.fields);

    if (config.slugFrom) {
      data.slug = await resolveSlug({ model: config.model, source: data[config.slugFrom] });
    }

    if (config.hasIsActive && data.isActive === undefined) {
      data.isActive = true;
    }

    if (config.hasCreatedById) {
      data.createdById = actorUserId || null;
    }

    await validateRelations(data);
    await validateUnique(data);

    return prisma.$transaction(async (tx) => {
      const record = await tx[config.model].create({ data, select: config.select });

      await createAuditLog(tx, {
        moduleCode: 'admin-masters',
        moduleName: 'Admin Masters',
        tableName: config.tableName,
        recordId: record.id,
        actionType: 'CREATE',
        performedByUserId: actorUserId,
        recordName: config.recordName(record),
        comments: `${config.label} created`,
        details: Object.entries(data).map(([fieldName, newValue]) => ({
          fieldName,
          oldValue: null,
          newValue,
          dataType: typeof newValue
        }))
      });

      return record;
    });
  };

  const updateRecord = async (id, payload, actorUserId) => {
    const recordId = Number(id);
    const currentRecord = await ensureExists({ model: config.model, id: recordId, label: config.label });
    const data = pickData(payload, config.fields);

    if (config.slugFrom) {
      data.slug = await resolveSlug({ model: config.model, source: data[config.slugFrom], excludeId: recordId });
    }

    if (config.hasModifiedById) {
      data.modifiedById = actorUserId || null;
    }

    await validateRelations(data);
    await validateUnique(data, recordId);

    return prisma.$transaction(async (tx) => {
      const record = await tx[config.model].update({
        where: { id: recordId },
        data,
        select: config.select
      });

      await createAuditLog(tx, {
        moduleCode: 'admin-masters',
        moduleName: 'Admin Masters',
        tableName: config.tableName,
        recordId: record.id,
        actionType: 'UPDATE',
        performedByUserId: actorUserId,
        recordName: config.recordName(record),
        comments: `${config.label} updated`,
        details: buildChangeDetails(currentRecord, record, Object.keys(data))
      });

      return record;
    });
  };

  const listRecords = async (query) => {
    const page = parsePositiveInt(query.page, 1);
    const limit = parsePositiveInt(query.limit, 10);
    const search = query.search ? String(query.search).trim() : undefined;
    const isActive = parseBooleanFilter(query.isActive);
    const filters = {};

    (config.filterFields || []).forEach((fieldName) => {
      const value = parsePositiveInt(query[fieldName], undefined);
      if (value) {
        filters[fieldName] = value;
      }
    });

    const where = buildWhere({
      search,
      searchFields: config.searchFields,
      filters,
      isActive
    });

    const [items, total] = await prisma.$transaction([
      prisma[config.model].findMany({
        where,
        select: config.select,
        orderBy: config.orderBy || { id: 'asc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma[config.model].count({ where })
    ]);

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  };

  const getRecord = async (id) => {
    const record = await prisma[config.model].findUnique({
      where: { id: Number(id) },
      select: config.select
    });

    if (!record) {
      throw createHttpError(404, `${config.label} not found`);
    }

    return record;
  };

  const updateStatus = async (id, payload, actorUserId) => {
    const recordId = Number(id);
    const currentRecord = await ensureExists({ model: config.model, id: recordId, label: config.label });
    const data = { isActive: payload.isActive };

    if (config.hasModifiedById) {
      data.modifiedById = actorUserId || null;
    }

    return prisma.$transaction(async (tx) => {
      const record = await tx[config.model].update({
        where: { id: recordId },
        data,
        select: config.select
      });

      await createAuditLog(tx, {
        moduleCode: 'admin-masters',
        moduleName: 'Admin Masters',
        tableName: config.tableName,
        recordId: record.id,
        actionType: record.isActive ? 'ACTIVATE' : 'DEACTIVATE',
        performedByUserId: actorUserId,
        recordName: config.recordName(record),
        comments: `${config.label} ${record.isActive ? 'activated' : 'deactivated'}`,
        details: buildChangeDetails(currentRecord, record, Object.keys(data))
      });

      return record;
    });
  };

  return {
    createRecord,
    updateRecord,
    listRecords,
    getRecord,
    updateStatus
  };
};

const createAdminMasterController = (service, responseKey, label, pluralResponseKey = `${responseKey}s`) => ({
  create: async (req, res, next) => {
    try {
      const record = await service.createRecord(req.body, req.user.userId);
      return apiResponse(res, {
        statusCode: 201,
        message: `${label} created successfully`,
        data: { [responseKey]: record }
      });
    } catch (error) {
      return next(error);
    }
  },
  update: async (req, res, next) => {
    try {
      const record = await service.updateRecord(req.params.id, req.body, req.user.userId);
      return apiResponse(res, {
        message: `${label} updated successfully`,
        data: { [responseKey]: record }
      });
    } catch (error) {
      return next(error);
    }
  },
  list: async (req, res, next) => {
    try {
      const { items, meta } = await service.listRecords(req.query);
      return apiResponse(res, {
        message: `${label} list fetched successfully`,
        data: { [pluralResponseKey]: items },
        meta
      });
    } catch (error) {
      return next(error);
    }
  },
  detail: async (req, res, next) => {
    try {
      const record = await service.getRecord(req.params.id);
      return apiResponse(res, {
        message: `${label} detail fetched successfully`,
        data: { [responseKey]: record }
      });
    } catch (error) {
      return next(error);
    }
  },
  status: async (req, res, next) => {
    try {
      const record = await service.updateStatus(req.params.id, req.body, req.user.userId);
      return apiResponse(res, {
        message: `${label} status updated successfully`,
        data: { [responseKey]: record }
      });
    } catch (error) {
      return next(error);
    }
  }
});

const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

const sendValidationError = (res, message) => {
  return apiResponse(res, {
    statusCode: 400,
    success: false,
    message,
    data: {},
    meta: {}
  });
};

const createValidation = (requiredFields = []) => {
  const validateIdParam = (req, res, next) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return sendValidationError(res, 'Valid id is required');
    }

    return next();
  };

  const validatePayload = (req, res, next) => {
    const payload = req.body || {};

    for (const field of requiredFields) {
      const value = payload[field.name];

      if (field.type === 'string' && !isNonEmptyString(value)) {
        return sendValidationError(res, `${field.name} is required`);
      }

      if ((field.type === 'int' || field.type === 'decimal') && (value === undefined || value === null || value === '')) {
        return sendValidationError(res, `${field.name} is required`);
      }
    }

    return next();
  };

  const validateStatusPayload = (req, res, next) => {
    if (typeof (req.body || {}).isActive !== 'boolean') {
      return sendValidationError(res, 'isActive boolean is required');
    }

    return next();
  };

  return {
    validateIdParam,
    validatePayload,
    validateStatusPayload
  };
};

const createAdminMasterRoutes = ({ controller, validation, menuPath }) => {
  const router = require('express').Router();
  const adminOnly = roleMiddleware(['admin']);
  const canCreate = permissionMiddleware({ menuPath, action: 'canCreate' });
  const canRead = permissionMiddleware({ menuPath, action: 'canRead' });
  const canUpdate = permissionMiddleware({ menuPath, action: 'canUpdate' });

  router.use(authMiddleware);
  router.use(adminOnly);

  router.post('/create', canCreate, validation.validatePayload, controller.create);
  router.put('/update/:id', canUpdate, validation.validateIdParam, validation.validatePayload, controller.update);
  router.get('/list', canRead, controller.list);
  router.get('/detail/:id', canRead, validation.validateIdParam, controller.detail);
  router.patch('/status/:id', canUpdate, validation.validateIdParam, validation.validateStatusPayload, controller.status);

  return router;
};

module.exports = {
  prisma,
  createHttpError,
  parsePositiveInt,
  parseBooleanFilter,
  createAdminMasterService,
  createAdminMasterController,
  createValidation,
  createAdminMasterRoutes,
  ensureForeignKey,
  ensureUniqueComposite,
  ensureUniqueField,
  normalizeRequiredString,
  normalizeNullableString
};
