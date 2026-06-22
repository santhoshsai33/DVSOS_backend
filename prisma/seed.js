const { PrismaClient } = require('@prisma/client');
const { seedStateDistricts } = require('./seedStatesDistricts');
const { seedSuperAdmin } = require('./seeds/super-admin.seed');
const { seedMenus } = require('./seedMenus');
const { seedServiceCategories } = require('./seedServiceCategories');
const { seedServiceCentersLocations } = require('./seedServiceCentersLocations');

const prisma = new PrismaClient();

const runSeed = async () => {
  await seedStateDistricts(prisma);
  await seedServiceCentersLocations(prisma);
  await seedSuperAdmin(prisma);
  await seedServiceCategories(prisma);
  await seedMenus(prisma);
};

runSeed()
  .catch((error) => {
    console.error('Prisma seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
