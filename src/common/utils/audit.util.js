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



const createAuditLog = async (
  tx,
  {
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
  const data = {
    tableName,
    recordId: BigInt(recordId),
    actionType,
    recordName: recordName || null,
    transactionId: crypto.randomUUID(),
    comments: comments || null
  };

  if (performedByUserId) {
    data.performedBy = { connect: { id: performedByUserId } };
  } else {
    throw new Error('performedByUserId is required for createAuditLog');
  }

  if (locationId) {
    data.location = { connect: { id: locationId } };
  }

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
