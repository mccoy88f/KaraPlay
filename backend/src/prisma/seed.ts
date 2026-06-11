import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  // Create a test event
  const event = await prisma.event.upsert({
    where: { joinCode: 'TEST01' },
    update: {},
    create: {
      name: 'Karaoke Night Test',
      location: 'Bar dello Sport',
      date: new Date(),
      joinCode: 'TEST01',
      hostId: 'admin',
      status: 'OPEN',
    },
  })

  console.log('Created event:', event.name, '- Code:', event.joinCode)
  console.log('Seed complete!')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
