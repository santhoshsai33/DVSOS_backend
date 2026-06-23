const {
  createAdminMasterService,
  createHttpError,
  prisma
} = require('../common');

const locationSelect = {
  id: true,
  serviceCenterId: true,
  stateId: true,
  districtId: true,
  locationHeadUserId: true,
  locationCode: true,
  locationName: true,
  locationType: true,
  address: true,
  city: true,
  pincode: true,
  latitude: true,
  longitude: true,
  contactPhone: true,
  contactEmail: true,
  isActive: true,
  createdById: true,
  modifiedById: true,
  createdAt: true,
  updatedAt: true,
  serviceCenter: {
    select: {
      id: true,
      serviceCenterCode: true,
      serviceCenterName: true
    }
  },
  state: {
    select: {
      id: true,
      stateName: true,
      stateCode: true
    }
  },
  district: {
    select: {
      id: true,
      districtName: true
    }
  },
  locationHead: {
    select: {
      id: true,
      fullName: true,
      emailId: true
    }
  }
};

const validateLocationRelations = async (data) => {
  const [serviceCenter, state, district, locationHead] = await Promise.all([
    prisma.serviceCenter.findUnique({ where: { id: data.serviceCenterId }, select: { id: true } }),
    prisma.state.findUnique({ where: { id: data.stateId }, select: { id: true } }),
    prisma.district.findUnique({ where: { id: data.districtId }, select: { id: true, stateId: true } }),
    data.locationHeadUserId
      ? prisma.user.findUnique({ where: { id: data.locationHeadUserId }, select: { id: true } })
      : Promise.resolve(null)
  ]);

  if (!serviceCenter) {
    throw createHttpError(400, 'serviceCenterId must reference an existing record');
  }

  if (!state) {
    throw createHttpError(400, 'stateId must reference an existing record');
  }

  if (!district) {
    throw createHttpError(400, 'districtId must reference an existing record');
  }

  if (district.stateId !== data.stateId) {
    throw createHttpError(400, 'districtId must belong to stateId');
  }

  if (data.locationHeadUserId && !locationHead) {
    throw createHttpError(400, 'locationHeadUserId must reference an existing user');
  }
};

module.exports = createAdminMasterService({
  model: 'location',
  tableName: 'locations',
  label: 'Location',
  select: locationSelect,
  fields: [
    { name: 'serviceCenterId', type: 'int', required: true },
    { name: 'stateId', type: 'int', required: true },
    { name: 'districtId', type: 'int', required: true },
    { name: 'locationHeadUserId', type: 'optionalInt' },
    { name: 'locationCode', type: 'string' },
    { name: 'locationName', type: 'string', required: true },
    { name: 'locationType', type: 'string', required: true },
    { name: 'address', type: 'string' },
    { name: 'city', type: 'string' },
    { name: 'pincode', type: 'string' },
    { name: 'latitude', type: 'decimal' },
    { name: 'longitude', type: 'decimal' },
    { name: 'contactPhone', type: 'string' },
    { name: 'contactEmail', type: 'string' },
    { name: 'isActive', type: 'boolean' }
  ],
  hasIsActive: true,
  hasCreatedById: true,
  hasModifiedById: true,
  autoGenerateCode: true,
  uniqueFields: [
    { fieldName: 'locationCode', label: 'Location code' }
  ],
  searchFields: ['locationName', 'locationCode', 'city'],
  filterFields: ['serviceCenterId', 'stateId', 'districtId'],
  validateRelations: validateLocationRelations,
  recordName: (location) => location.locationName
});
