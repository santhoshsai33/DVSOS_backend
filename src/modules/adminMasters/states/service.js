const { createAdminMasterService } = require('../common');

const stateSelect = {
  id: true,
  stateName: true,
  stateCode: true,
  isActive: true,
  createdAt: true,
  updatedAt: true
};

module.exports = createAdminMasterService({
  model: 'state',
  tableName: 'states',
  label: 'State',
  select: stateSelect,
  fields: [
    { name: 'stateName', type: 'string', required: true },
    { name: 'stateCode', type: 'string', required: true },
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
