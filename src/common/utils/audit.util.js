const crypto = require('crypto');
const { generateSlug, generateUniqueSlug } = require('./slug.util');

const serializeAuditValue = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
};

const ensureAuditModule = async (tx, { moduleCode, moduleName }) => {
  let existingModule = await tx.module.findUnique({
    where: { moduleCode },
    select: { id: true }
  });

  if (existingModule) {
    return existingModule;
  }

  const baseSlug = generateSlug(moduleName || moduleCode);
  const slug = await generateUniqueSlug(baseSlug, async (s) => {
    const found = await tx.module.findFirst({ where: { slug: s }, select: { id: true } });
    return !!found;
  });

  try {
    return await tx.module.upsert({
      where: { moduleCode },
      update: {
        moduleName,
        isActive: true
      },
      create: {
        moduleCode,
        moduleName,
        slug,
        isActive: true
      },
      select: { id: true }
    });
  } catch (err) {
    if (err.code === 'P2002') {
      const raceExisting = await tx.module.findUnique({
        where: { moduleCode },
        select: { id: true }
      });
      if (raceExisting) return raceExisting;
    }
    throw err;
  }
};

const createAuditLog = async (
  tx,
  {
    moduleCode = 'role-management',
    moduleName = 'Role Management',
    tableName,
    recordId,
    actionType,
    performedByUserId,
    recordName,
    comments,
    details = [],
    locationId = null,
    moduleId = null
  }
) => {
  const auditModule = moduleId ? { id: moduleId } : await ensureAuditModule(tx, { moduleCode, moduleName });

  const data = {
    moduleId: auditModule.id,
    locationId,
    tableName,
    recordId: BigInt(recordId),
    actionType,
    performedByUserId,
    recordName: recordName || null,
    transactionId: crypto.randomUUID(),
    comments: comments || null
  };

  if (details.length > 0) {
    data.details = {
      create: details.map((detail) => ({
        fieldName: detail.fieldName,
        oldValue: serializeAuditValue(detail.oldValue),
        newValue: serializeAuditValue(detail.newValue),
        dataType: detail.dataType || null
      }))
    };
  }

  return tx.auditLog.create({ data });
};

const buildChangeDetails = (oldRecord, newRecord, fields) => {
  return fields
    .filter((fieldName) => oldRecord[fieldName] !== newRecord[fieldName])
    .map((fieldName) => ({
      fieldName,
      oldValue: oldRecord[fieldName],
      newValue: newRecord[fieldName],
      dataType: typeof newRecord[fieldName]
    }));
};

module.exports = {
  ensureAuditModule,
  createAuditLog,
  buildChangeDetails
};
