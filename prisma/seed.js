const { PrismaClient } = require('@prisma/client');
const { seedStateDistricts } = require('./seeds/state-district.seed');
const { seedSuperAdmin } = require('./seeds/super-admin.seed');

const prisma = new PrismaClient();

const runSeed = async () => {
  await seedStateDistricts(prisma);
  await seedSuperAdmin(prisma);
};

runSeed()
  .catch((error) => {
    console.error('Prisma seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
