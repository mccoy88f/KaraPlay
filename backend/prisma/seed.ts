import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const host = await prisma.user.upsert({
    where: { email: "host@karaoke.local" },
    update: {},
    create: {
      nickname: "Host",
      email: "host@karaoke.local",
      emailVerified: true,
    },
  });

  const existing = await prisma.event.findFirst({
    where: { joinCode: "000000" },
  });
  if (!existing) {
    await prisma.event.create({
      data: {
        name: "Serata demo",
        location: "Locale di test",
        date: new Date(),
        status: "OPEN",
        joinCode: "000000",
        hostId: host.id,
      },
    });
  }

  const demoSong = await prisma.song.findFirst({
    where: { title: "Brano demo", artist: "Catalogo MIDI" },
  });
  if (!demoSong) {
    await prisma.song.create({
      data: {
        title: "Brano demo",
        artist: "Catalogo MIDI",
        source: "MIDI",
        tags: ["demo"],
        duration: 180,
        language: "it",
      },
    });
  }

  console.log("Seed completato: host, evento demo (PIN 000000), canzone demo MIDI");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
