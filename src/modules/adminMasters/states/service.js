const { createAdminMasterService } = require('../common');
const { generateUniqueCode, CODE_CONFIG } = require('../../../common/utils/code.util');
const prisma = require('../../../config/db');

const stateSelect = {
  id: true,
  stateName: true,
  stateCode: true,
  isActive: true,
  createdAt: true,
  updatedAt: true
};

const baseService = createAdminMasterService({
  model: 'state',
  tableName: 'states',
  label: 'State',
  select: stateSelect,
  fields: [
    { name: 'stateName', type: 'string', required: true },
    { name: 'stateCode', type: 'string' },
    { name: 'isActive', type: 'boolean' }
  ],
  hasIsActive: true,
  uniqueFields: [
    { fieldName: 'stateName', label: 'State name' },
    { fieldName: 'stateCode', label: 'State code' }
  ],
  searchFields: ['stateName', 'stateCode'],
  recordName: (state) => state.stateName
});

const createRecord = async (payload, actorUserId) => {
  if (!payload.stateCode) {
    const latestState = await prisma.state.findFirst({
      orderBy: { id: 'desc' },
      select: { stateCode: true }
    });
    
    payload.stateCode = await generateUniqueCode({
      prefix: CODE_CONFIG.state.prefix,
      latestCode: latestState?.stateCode,
      existsCallback: async (code) => {
        const existing = await prisma.state.findFirst({ where: { stateCode: code }, select: { id: true } });
        return !!existing;
      }
    });
  }
  return baseService.createRecord(payload, actorUserId);
};

module.exports = {
  ...baseService,
  createRecord
};
