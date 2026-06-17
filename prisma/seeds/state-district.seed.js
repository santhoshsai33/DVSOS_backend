const { PrismaClient } = require('@prisma/client');

const TAMIL_NADU_STATE = {
  stateName: 'Tamil Nadu',
  stateCode: 'TN'
};

const TAMIL_NADU_DISTRICTS = [
  'Ariyalur',
  'Chengalpattu',
  'Chennai',
  'Coimbatore',
  'Cuddalore',
  'Dharmapuri',
  'Dindigul',
  'Erode',
  'Kallakurichi',
  'Kancheepuram',
  'Kanniyakumari',
  'Karur',
  'Krishnagiri',
  'Madurai',
  'Mayiladuthurai',
  'Nagapattinam',
  'Namakkal',
  'Nilgiris',
  'Perambalur',
  'Pudukkottai',
  'Ramanathapuram',
  'Ranipet',
  'Salem',
  'Sivaganga',
  'Tenkasi',
  'Thanjavur',
  'Theni',
  'Thoothukudi',
  'Tiruchirappalli',
  'Tirunelveli',
  'Tirupathur',
  'Tiruppur',
  'Tiruvallur',
  'Tiruvannamalai',
  'Tiruvarur',
  'Vellore',
  'Viluppuram',
  'Virudhunagar'
];

const seedStateDistricts = async (prisma) => {
  await prisma.$transaction(async (tx) => {
    const state = await tx.state.upsert({
      where: { stateCode: TAMIL_NADU_STATE.stateCode },
      update: {
        stateName: TAMIL_NADU_STATE.stateName,
        isActive: true
      },
      create: {
        ...TAMIL_NADU_STATE,
        isActive: true
      }
    });

    console.log('Tamil Nadu state seeded');

    for (const districtName of TAMIL_NADU_DISTRICTS) {
      await tx.district.upsert({
        where: {
          stateId_districtName: {
            stateId: state.id,
            districtName
          }
        },
        update: {
          districtName,
          isActive: true
        },
        create: {
          stateId: state.id,
          districtName,
          isActive: true
        }
      });
    }

    console.log('Districts seeded');
  });
};

const run = async () => {
  const prisma = new PrismaClient();

  try {
    await seedStateDistricts(prisma);
  } catch (error) {
    console.error('State and district seed failed:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
};

if (require.main === module) {
  run();
}

module.exports = {
  seedStateDistricts,
  TAMIL_NADU_STATE,
  TAMIL_NADU_DISTRICTS
};
