const { generateSlug } = require('../../src/common/utils/slug.util');

const rolesData = [
  { name: 'Floor Supervisor', slug: 'floor_supervisor', description: 'Floor supervisor managing mechanical stage' },
  { name: 'Manager', slug: 'manager', description: 'Workshop manager' },
  { name: 'Managing Director', slug: 'managing_director', description: 'Managing Director' },
  { name: 'CRM Team', slug: 'crm_team', description: 'Customer relationship management team' }
];

async function seedStageTimeLimits(prisma) {
  console.log('Seeding roles and stage time limits...');

  // 1. Seed Roles
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
  console.log('Roles upserted successfully.');

  // 2. Fetch Status Masters
  const approvalPendingStatus = await prisma.statusMaster.findFirst({
    where: {
      statusCode: 'APPROVAL_PENDING',
      module: { moduleCode: 'job-card' }
    }
  });

  const mechanicalInProgressStatus = await prisma.statusMaster.findFirst({
    where: {
      statusCode: 'MECHANICAL_IN_PROGRESS',
      module: { moduleCode: 'job-card' }
    }
  });

  const bodyShopInProgressStatus = await prisma.statusMaster.findFirst({
    where: {
      statusCode: 'BODY_SHOP_IN_PROGRESS',
      module: { moduleCode: 'job-card' }
    }
  });

  const waterWashInProgressStatus = await prisma.statusMaster.findFirst({
    where: {
      statusCode: 'WATER_WASH_IN_PROGRESS',
      module: { moduleCode: 'job-card' }
    }
  });

  // 3. Define Stage Limits Data (2 minutes as requested by the user)
  const limitsData = [
    {
      stageCode: 'APPROVAL_PENDING',
      stageName: 'Customer Approval',
      allowedMinutes: 2,
      statusId: approvalPendingStatus?.id || null,
      notifyRoleId: rolesMap['crm_team']
    },
    {
      stageCode: 'ADDITIONAL_WORK',
      stageName: 'Additional Work Approval',
      allowedMinutes: 2,
      statusId: null,
      notifyRoleId: rolesMap['crm_team']
    },
    {
      stageCode: 'MECHANICAL_IN_PROGRESS',
      stageName: 'Mechanical Work',
      allowedMinutes: 2,
      statusId: mechanicalInProgressStatus?.id || null,
      notifyRoleId: rolesMap['floor_supervisor']
    },
    {
      stageCode: 'BODY_SHOP_IN_PROGRESS',
      stageName: 'Body Shop Work',
      allowedMinutes: 2,
      statusId: bodyShopInProgressStatus?.id || null,
      notifyRoleId: rolesMap['floor_supervisor']
    },
    {
      stageCode: 'WATER_WASH_IN_PROGRESS',
      stageName: 'Water Wash Work',
      allowedMinutes: 2,
      statusId: waterWashInProgressStatus?.id || null,
      notifyRoleId: rolesMap['floor_supervisor']
    }
  ];

  // 4. Seed Stage Limits
  for (const limit of limitsData) {
    const existing = await prisma.stageTimeLimit.findFirst({
      where: { stageCode: limit.stageCode }
    });

    if (existing) {
      await prisma.stageTimeLimit.update({
        where: { id: existing.id },
        data: {
          stageName: limit.stageName,
          allowedMinutes: limit.allowedMinutes,
          statusId: limit.statusId,
          notifyRoleId: limit.notifyRoleId,
          isActive: true
        }
      });
    } else {
      await prisma.stageTimeLimit.create({
        data: {
          stageCode: limit.stageCode,
          stageName: limit.stageName,
          allowedMinutes: limit.allowedMinutes,
          statusId: limit.statusId,
          notifyRoleId: limit.notifyRoleId,
          isActive: true
        }
      });
    }
  }

  console.log('Stage time limits seeded successfully.');
}

module.exports = {
  seedStageTimeLimits
};
