import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.siteSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });

  const rooms = await prisma.galleryRoom.count();
  if (rooms === 0) {
    await prisma.galleryRoom.createMany({
      data: [
        { name: 'Drawing Hall', description: 'Pencil and ink works on the gallery walls.', order: 1 },
        { name: 'Ceramic Court', description: 'Ceramic pieces on lit pedestals.', order: 2 },
      ],
    });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
