const {
  createAdminMasterService,
  ensureForeignKey,
  ensureUniqueComposite
} = require('../common');

const districtSelect = {
  id: true,
  stateId: true,
  districtName: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  state: {
    select: {
      id: true,
      stateName: true,
      stateCode: true
    }
  }
};

module.exports = createAdminMasterService({
  model: 'district',
  tableName: 'districts',
  label: 'District',
  select: districtSelect,
  fields: [
    { name: 'stateId', type: 'int', required: true },
    { name: 'districtName', type: 'string', required: true },
    { name: 'isActive', type: 'boolean' }
  ],
  hasIsActive: true,
  searchFields: ['districtName'],
  filterFields: ['stateId'],
  validateRelations: async (data) => {
    await ensureForeignKey({ model: 'state', id: data.stateId, label: 'stateId' });
  },
  validateUnique: async (data, excludeId) => {
    await ensureUniqueComposite({
      model: 'district',
      fields: {
        stateId: data.stateId,
        districtName: data.districtName
      },
      label: 'District name',
      excludeId
    });
  },
  recordName: (district) => district.districtName
});
