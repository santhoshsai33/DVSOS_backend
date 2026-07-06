const rolesData = [
  { name: 'Floor Supervisor', slug: 'floor_supervisor', description: 'Floor supervisor managing mechanical stage' },
  { name: 'Manager', slug: 'manager', description: 'Workshop manager' },
  { name: 'Managing Director', slug: 'managing_director', description: 'Managing Director' },
  { name: 'CRM Team', slug: 'crm_team', description: 'Customer relationship management team' }
];

const limitsData = [
  {
    stageCode: 'APPROVAL_PENDING',
    moduleCode: 'job-card',
    statusCode: 'APPROVAL_PENDING',
    allowedMinutes: 2,
    notifyRoleSlug: 'crm_team'
  },
  {
    stageCode: 'ADDITIONAL_WORK',
    moduleCode: 'approval-status',
    statusCode: 'PENDING',
    allowedMinutes: 2,
    notifyRoleSlug: 'crm_team'
  },
  {
    stageCode: 'MECHANICAL_IN_PROGRESS',
    moduleCode: 'job-card',
    statusCode: 'MECHANICAL_IN_PROGRESS',
    allowedMinutes: 2,
    notifyRoleSlug: 'floor_supervisor'
  },
  {
    stageCode: 'BODY_SHOP_IN_PROGRESS',
    moduleCode: 'job-card',
    statusCode: 'BODY_SHOP_IN_PROGRESS',
    allowedMinutes: 2,
    notifyRoleSlug: 'floor_supervisor'
  },
  {
    stageCode: 'WATER_WASH_IN_PROGRESS',
    moduleCode: 'job-card',
    statusCode: 'WATER_WASH_IN_PROGRESS',
    allowedMinutes: 2,
    notifyRoleSlug: 'floor_supervisor'
  }
];

const seedRoles = async (prisma) => {
  const rolesMap = {};

  for (const roleInfo of rolesData) {
    const role = await prisma.role.upsert({
      where: { slug: roleInfo.slug },
      update: {
        name: roleInfo.name,
        description: roleInfo.description,
        isActive: true
      },
      create: {
        name: roleInfo.name,
        slug: roleInfo.slug,
        description: roleInfo.description,
        isActive: true
      }
    });

    rolesMap[roleInfo.slug] = role.id;
  }

  return rolesMap;
};

const resolveStatus = async (prisma, { moduleCode, statusCode }) => {
  const status = await prisma.statusMaster.findFirst({
    where: {
      statusCode,
      module: { moduleCode }
    },
    select: {
      id: true,
      moduleId: true
    }
  });

  if (!status) {
    throw new Error(`Status ${moduleCode}.${statusCode} must be seeded before stage time limits`);
  }

  return status;
};

async function seedStageTimeLimits(prisma) {
  console.log('Seeding roles and stage time limits...');

  const rolesMap = await seedRoles(prisma);
  console.log('Roles upserted successfully.');

  for (const limit of limitsData) {
    const status = await resolveStatus(prisma, limit);
    const notifyRoleId = rolesMap[limit.notifyRoleSlug] || null;

    const existing = await prisma.stageTimeLimit.findFirst({
      where: {
        OR: [
          {
            locationId: null,
            moduleId: status.moduleId,
            statusId: status.id
          },
          {
            stageCode: limit.stageCode
          }
        ]
      },
      select: { id: true }
    });

    const data = {
      locationId: null,
      moduleId: status.moduleId,
      statusId: status.id,
      stageCode: limit.stageCode,
      allowedMinutes: limit.allowedMinutes,
      notifyRoleId,
      notifyUserId: null,
      isActive: true
    };

    if (existing) {
      await prisma.stageTimeLimit.update({
        where: { id: existing.id },
        data
      });
    } else {
      await prisma.stageTimeLimit.create({ data });
    }
  }

  console.log('Stage time limits seeded successfully.');
}

module.exports = {
  seedStageTimeLimits
};

if (require.main === module) {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();

  seedStageTimeLimits(prisma)
    .catch((error) => {
      console.error('Stage time limits seed failed:', error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
