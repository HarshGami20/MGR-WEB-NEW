/**
 * Wipes all data and creates a single Super Admin user with full permissions.
 * Run from backend/api-server:  npm run seed:admin
 *
 * Optional env overrides:
 *   SEED_ADMIN_NAME, SEED_ADMIN_MOBILE, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { PERMISSION_MODULE_KEYS } from "../src/lib/permissions";
import { clearDatabase } from "./lib/clear-database";

const prisma = new PrismaClient();

function fullAccessPermissions(): string {
  const row = { view: true, add: true, edit: true, delete: true };
  const modules = Object.fromEntries(PERMISSION_MODULE_KEYS.map((m) => [m, { ...row }]));
  return JSON.stringify(modules);
}

async function main() {
  const name = process.env.SEED_ADMIN_NAME?.trim() || "Super Admin";
  const mobile = process.env.SEED_ADMIN_MOBILE?.trim() || "9999999999";
  const email = process.env.SEED_ADMIN_EMAIL?.trim() || "admin@mgrcasa.in";
  const password = process.env.SEED_ADMIN_PASSWORD?.trim() || "admin123";

  console.log("Resetting database (admin-only)…\n");
  await clearDatabase(prisma);

  const role = await prisma.role.create({
    data: { name: "Super Admin", permissions: fullAccessPermissions() },
  });

  await prisma.user.create({
    data: {
      name,
      mobile,
      email,
      passwordHash: await bcrypt.hash(password, 10),
      roleId: role.id,
      isActive: true,
    },
  });

  console.log("Done. Database contains only one Super Admin user.\n");
  console.log("Login:");
  console.log(`  Mobile:   ${mobile}`);
  console.log(`  Password: ${password}`);
  console.log(`  Name:     ${name}`);
  if (email) console.log(`  Email:    ${email}`);
  console.log("\nChange the password after first login (Users → reset password).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
