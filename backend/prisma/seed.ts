import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Super admin di partenza: cambia la password al primo accesso da /admin → Account.
  const superAdmin = await prisma.adminUser.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      username: "admin",
      passwordHash: bcrypt.hashSync("admin", 10),
      role: "SUPERADMIN",
    },
  });

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
        adminId: superAdmin.id,
      },
    });
  } else if (!existing.adminId) {
    await prisma.event.update({ where: { id: existing.id }, data: { adminId: superAdmin.id } });
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
        adminId: superAdmin.id,
      },
    });
  } else if (!demoSong.adminId) {
    await prisma.song.update({ where: { id: demoSong.id }, data: { adminId: superAdmin.id } });
  }

  console.log("Seed completato: super admin (admin/admin), evento demo (PIN 000000), canzone demo MIDI");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
