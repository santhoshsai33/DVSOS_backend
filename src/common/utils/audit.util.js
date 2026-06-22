const crypto = require('crypto');

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

const ensureAuditModule = (tx, { moduleCode, moduleName }) => {
  return tx.module.upsert({
    where: { moduleCode },
    update: {
      moduleName,
      isActive: true
    },
    create: {
      moduleCode,
      moduleName,
      isActive: true
    },
    select: { id: true }
  });
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
    locationId = null
  }
) => {
  const module = await ensureAuditModule(tx, { moduleCode, moduleName });

  const data = {
    moduleId: module.id,
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
  createAuditLog,
  buildChangeDetails
};
