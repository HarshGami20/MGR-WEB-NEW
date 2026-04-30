/**
 * Populates the database with demo data for local development.
 * Run: npm run seed  (from backend/api-server)
 *
 * Resets existing rows (clears business data, then inserts seed rows).
 */
import { Prisma, PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const D = (v: string | number) => new Prisma.Decimal(String(v));

async function clearAll() {
  await prisma.payment.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.purchaseOrderItem.deleteMany();
  await prisma.purchaseOrder.deleteMany();
  await prisma.inventoryLog.deleteMany();
  await prisma.productVariant.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
  await prisma.user.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.manufacturer.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.role.deleteMany();
  await prisma.setting.deleteMany();
}

const superAdminPermissions = {
  dashboard: { read: true },
  users: { read: true, create: true, update: true, delete: true },
  roles: { read: true, create: true, update: true, delete: true },
  branches: { read: true, create: true, update: true, delete: true },
  categories: { read: true, create: true, update: true, delete: true },
  products: { read: true, create: true, update: true, delete: true },
  inventory: { read: true, create: true, update: true, delete: true },
  orders: { read: true, create: true, update: true, delete: true },
  invoices: { read: true, create: true, update: true, delete: true },
  payments: { read: true, create: true, update: true, delete: true },
  suppliers: { read: true, create: true, update: true, delete: true },
  manufacturers: { read: true, create: true, update: true, delete: true },
  purchaseOrders: { read: true, create: true, update: true, delete: true },
  settings: { read: true, update: true },
};

async function main() {
  console.log("Seeding database…");

  await clearAll();

  const roleSuperAdmin = await prisma.role.create({
    data: {
      name: "Super Admin",
      permissions: JSON.stringify(superAdminPermissions),
    },
  });

  const portalPermissions = JSON.stringify({
    dashboard: { read: true },
    purchaseOrders: { read: true, update: true },
    settings: { read: true },
  });

  const roleSupplierPortal = await prisma.role.create({
    data: {
      name: "Supplier Portal",
      permissions: portalPermissions,
    },
  });

  const roleManufacturerPortal = await prisma.role.create({
    data: {
      name: "Manufacturer Portal",
      permissions: portalPermissions,
    },
  });

  const branch = await prisma.branch.create({
    data: {
      name: "Main Showroom",
      code: "MAIN",
      city: "Mumbai",
      state: "Maharashtra",
      address: "123 Industrial Estate",
      phone: "022-12345678",
      email: "main@example.com",
      isActive: true,
    },
  });

  const passwordHash = await bcrypt.hash("admin123", 10);

  await prisma.user.create({
    data: {
      name: "Admin User",
      mobile: "9999999999",
      email: "admin@example.com",
      passwordHash,
      roleId: roleSuperAdmin.id,
      branchId: branch.id,
      isActive: true,
    },
  });

  await prisma.setting.create({
    data: {
      companyName: "MGR Casa Furniture",
      gstNumber: "27AAAAA0000A1Z5",
      address: "123 Industrial Estate, Mumbai",
      phone: "022-12345678",
      email: "info@mgrcasa.example",
      defaultGstPercent: D(18),
      invoicePrefix: "INV",
    },
  });

  const catLiving = await prisma.category.create({
    data: { name: "Living Room" },
  });
  const catBed = await prisma.category.create({
    data: { name: "Bedroom" },
  });
  await prisma.category.create({
    data: { name: "Sofas", parentId: catLiving.id },
  });
  await prisma.category.create({
    data: { name: "Beds", parentId: catBed.id },
  });

  const p1 = await prisma.product.create({
    data: {
      name: "Oak 3-Seater Sofa",
      sku: "SOFA-OAK-3S",
      categoryId: catLiving.id,
      price: D(45999),
      gstPercent: D(18),
      stockQty: 12,
      lowStockThreshold: 3,
      description: "Solid oak frame, fabric upholstery",
    },
  });
  const p2 = await prisma.product.create({
    data: {
      name: "King Size Bed Frame",
      sku: "BED-KING-OAK",
      categoryId: catBed.id,
      price: D(32999),
      gstPercent: D(18),
      stockQty: 6,
      lowStockThreshold: 2,
      description: "King size, hydraulic storage",
    },
  });
  await prisma.product.create({
    data: {
      name: "Office Chair Ergonomic",
      sku: "CHAIR-ERG-01",
      categoryId: catLiving.id,
      price: D(8999),
      gstPercent: D(18),
      stockQty: 2,
      lowStockThreshold: 5,
      description: "Low stock demo item",
    },
  });

  await prisma.productVariant.create({
    data: {
      productId: p1.id,
      name: "Charcoal Grey",
      sku: "SOFA-OAK-3S-CG",
      price: D(46999),
      stockQty: 4,
      attributes: JSON.stringify({ color: "Charcoal Grey" }),
      isActive: true,
    },
  });

  const supplier = await prisma.supplier.create({
    data: {
      name: "WoodCraft Supplies Pvt Ltd",
      contactPerson: "R. Sharma",
      mobile: "9876501234",
      email: "orders@woodcraft.example",
      address: "Pune, MH",
      gstNumber: "27BBBBB0000B1Z5",
      isActive: true,
    },
  });

  const manufacturer = await prisma.manufacturer.create({
    data: {
      name: "FineWood Manufacturing",
      contactPerson: "A. Patil",
      mobile: "9876509876",
      specialization: "Solid wood frames",
      isActive: true,
    },
  });

  await prisma.inventoryLog.create({
    data: {
      productId: p1.id,
      type: "in",
      quantity: 12,
      notes: "Opening stock (seed)",
    },
  });

  const order = await prisma.order.create({
    data: {
      orderNumber: "ORD-SEED-001",
      customerName: "Demo Customer",
      customerMobile: "9123456789",
      customerAddress: "Andheri, Mumbai",
      isGst: true,
      customerGstNumber: "27CCCCC0000C1Z5",
      status: "completed",
      subtotal: D(38982.2),
      taxAmount: D(7016.8),
      totalAmount: D(45999),
      paidAmount: D(45999),
      branchId: branch.id,
      notes: "Seed order",
    },
  });

  await prisma.orderItem.create({
    data: {
      orderId: order.id,
      productId: p1.id,
      quantity: 1,
      unitPrice: D(38982.2),
      gstPercent: D(18),
      totalPrice: D(45999),
    },
  });

  await prisma.invoice.create({
    data: {
      invoiceNumber: "INV-SEED-001",
      orderId: order.id,
      isGst: true,
      cgst: D(3508.4),
      sgst: D(3508.4),
      igst: D(0),
      totalAmount: D(45999),
    },
  });

  await prisma.payment.create({
    data: {
      orderId: order.id,
      amount: D(45999),
      mode: "upi",
      notes: "Paid in full (seed)",
    },
  });

  await prisma.product.update({
    where: { id: p1.id },
    data: { stockQty: 11 },
  });
  await prisma.inventoryLog.create({
    data: {
      productId: p1.id,
      type: "out",
      quantity: 1,
      notes: "ORD-SEED-001",
    },
  });

  await prisma.purchaseOrder.create({
    data: {
      poNumber: "PO-SEED-001",
      type: "supplier",
      supplierId: supplier.id,
      status: "pending",
      totalAmount: D(120000),
      notes: "Pending supplier PO (seed)",
      branchId: branch.id,
      items: {
        create: [
          {
            productId: p2.id,
            quantity: 10,
            unitPrice: D(12000),
          },
        ],
      },
    },
  });

  await prisma.purchaseOrder.create({
    data: {
      poNumber: "PO-SEED-002",
      type: "manufacturer",
      manufacturerId: manufacturer.id,
      status: "pending",
      totalAmount: D(50000),
      branchId: branch.id,
    },
  });

  const supplierPortalHash = await bcrypt.hash("supplier123", 10);
  await prisma.user.create({
    data: {
      name: "WoodCraft Portal",
      mobile: "9876511111",
      email: "portal@woodcraft.example",
      passwordHash: supplierPortalHash,
      roleId: roleSupplierPortal.id,
      supplierId: supplier.id,
      isActive: true,
    },
  });

  const manufacturerPortalHash = await bcrypt.hash("mfg123", 10);
  await prisma.user.create({
    data: {
      name: "FineWood Portal",
      mobile: "9876522222",
      email: "portal@finewood.example",
      passwordHash: manufacturerPortalHash,
      roleId: roleManufacturerPortal.id,
      manufacturerId: manufacturer.id,
      isActive: true,
    },
  });

  console.log("Done.");
  console.log("Login: mobile 9999999999 / password admin123 (Super Admin)");
  console.log("Portal supplier: 9876511111 / supplier123 (WoodCraft POs)");
  console.log("Portal manufacturer: 9876522222 / mfg123 (FineWood POs)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });




//   cd backend/api-server
// npx prisma db push    # if schema not applied yet
// npm run seed