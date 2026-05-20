/**
 * Populates the database with realistic demo data for MGR Casa ERP.
 * Run from backend/api-server:  npm run seed
 *
 * Wipes business data and re-seeds branches, users, products, delivery slots,
 * orders (with delivery status), purchase orders, inventory, invoices, and payments.
 */
import { Prisma, PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { decrementProductStock, incrementProductStock, syncProductStockFromVariants } from "../src/lib/product-stock";

const prisma = new PrismaClient();

const D = (v: string | number) => new Prisma.Decimal(String(v));

/** UI-shaped permissions (view/add/edit/delete) — matches roles page and OpenAPI. */
function perm(
  modules: Record<string, Partial<{ view: boolean; add: boolean; edit: boolean; delete: boolean }>>,
): string {
  return JSON.stringify(modules);
}

function utcDateOnly(daysFromToday: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + daysFromToday);
  return d;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

async function clearAll() {
  await prisma.notificationRecipient.deleteMany();
  await prisma.notificationLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.notificationPreference.deleteMany();
  await prisma.userFcmToken.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.orderAssignee.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.deliverySlot.deleteMany();
  await prisma.purchaseOrderItem.deleteMany();
  await prisma.purchaseOrder.deleteMany();
  await prisma.inventoryLog.deleteMany();
  await prisma.productVariant.deleteMany();
  await prisma.product.deleteMany();
  await prisma.attributeOption.deleteMany();
  await prisma.attributeKey.deleteMany();
  await prisma.category.deleteMany();
  await prisma.userBranch.deleteMany();
  await prisma.user.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.manufacturer.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.role.deleteMany();
  await prisma.setting.deleteMany();
  await prisma.notificationTypeDefinition.deleteMany();
}

const ALL_MODULES = [
  "dashboard",
  "users",
  "roles",
  "branches",
  "categories",
  "products",
  "inventory",
  "orders",
  "deliveries",
  "invoices",
  "payments",
  "reports",
  "suppliers",
  "manufacturers",
  "purchaseOrders",
  "complaints",
  "settings",
] as const;

function fullAccess(): Record<string, { view: boolean; add: boolean; edit: boolean; delete: boolean }> {
  const row = { view: true, add: true, edit: true, delete: true };
  return Object.fromEntries(ALL_MODULES.map((m) => [m, { ...row }]));
}

async function main() {
  console.log("Seeding MGR Casa database…\n");
  await clearAll();

  // ——— Roles ———
  const roleSuperAdmin = await prisma.role.create({
    data: { name: "Super Admin", permissions: perm(fullAccess()) },
  });

  const roleBranchManager = await prisma.role.create({
    data: {
      name: "Branch Manager",
      permissions: perm({
        dashboard: { view: true },
        products: { view: true, add: true, edit: true },
        categories: { view: true, add: true, edit: true },
        inventory: { view: true, add: true, edit: true },
        orders: { view: true, add: true, edit: true, delete: true },
        complaints: { view: true, add: true, edit: true, delete: true },
        deliveries: { view: true, add: true, edit: true, delete: true },
        invoices: { view: true, add: true, edit: true },
        payments: { view: true, add: true, edit: true },
        purchaseOrders: { view: true, add: true, edit: true, delete: true },
        suppliers: { view: true, add: true, edit: true },
        manufacturers: { view: true, add: true, edit: true },
        reports: { view: true },
        settings: { view: true, edit: true },
      }),
    },
  });

  const roleSales = await prisma.role.create({
    data: {
      name: "Sales Executive",
      permissions: perm({
        dashboard: { view: true },
        products: { view: true },
        categories: { view: true },
        orders: { view: true, add: true, edit: true },
        complaints: { view: true, add: true, edit: true },
        deliveries: { view: true, edit: true },
        invoices: { view: true, add: true },
        payments: { view: true, add: true },
        reports: { view: true },
      }),
    },
  });

  const roleDelivery = await prisma.role.create({
    data: {
      name: "Delivery Coordinator",
      permissions: perm({
        dashboard: { view: true },
        orders: { view: true, edit: true },
        complaints: { view: true, add: true, edit: true },
        deliveries: { view: true, add: true, edit: true },
        products: { view: true },
      }),
    },
  });

  const portalPermissions = perm({
    dashboard: { view: true },
    purchaseOrders: { view: true, edit: true },
    products: { view: true },
    settings: { view: true },
  });

  const roleSupplierPortal = await prisma.role.create({
    data: { name: "Supplier Portal", permissions: portalPermissions },
  });

  const roleManufacturerPortal = await prisma.role.create({
    data: { name: "Manufacturer Portal", permissions: portalPermissions },
  });

  // ——— Branches ———
  const branchAndheri = await prisma.branch.create({
    data: {
      name: "Andheri Showroom",
      code: "ANDH",
      address: "Shop 12, Lokhandwala Complex, Andheri West",
      city: "Mumbai",
      state: "Maharashtra",
      phone: "022-26361234",
      email: "andheri@mgrcasa.in",
      isActive: true,
    },
  });

  const branchPune = await prisma.branch.create({
    data: {
      name: "Pune Warehouse & Studio",
      code: "PUNE",
      address: "Unit 4, Kalyani Nagar Industrial Park",
      city: "Pune",
      state: "Maharashtra",
      phone: "020-41234567",
      email: "pune@mgrcasa.in",
      isActive: true,
    },
  });

  const branchThane = await prisma.branch.create({
    data: {
      name: "Thane Experience Centre",
      code: "THNE",
      address: "Ground Floor, Hiranandani Estate, Ghodbunder Road",
      city: "Thane",
      state: "Maharashtra",
      phone: "022-25891234",
      email: "thane@mgrcasa.in",
      isActive: true,
    },
  });

  const allBranchIds = [branchAndheri.id, branchPune.id, branchThane.id];

  // ——— Users ———
  const hash = (pwd: string) => bcrypt.hash(pwd, 10);

  const admin = await prisma.user.create({
    data: {
      name: "Harsh Gami",
      mobile: "9999999999",
      email: "admin@mgrcasa.in",
      passwordHash: await hash("admin123"),
      roleId: roleSuperAdmin.id,
      branchId: branchAndheri.id,
      isActive: true,
      userBranches: { create: allBranchIds.map((branchId) => ({ branchId })) },
    },
  });

  const mgrAndheri = await prisma.user.create({
    data: {
      name: "Priya Sharma",
      mobile: "9876543210",
      email: "priya.sharma@mgrcasa.in",
      passwordHash: await hash("mgr123"),
      roleId: roleBranchManager.id,
      branchId: branchAndheri.id,
      isActive: true,
      userBranches: {
        create: [{ branchId: branchAndheri.id }, { branchId: branchThane.id }],
      },
    },
  });

  const mgrPune = await prisma.user.create({
    data: {
      name: "Rahul Mehta",
      mobile: "9876543211",
      email: "rahul.mehta@mgrcasa.in",
      passwordHash: await hash("mgr123"),
      roleId: roleBranchManager.id,
      branchId: branchPune.id,
      isActive: true,
      userBranches: { create: [{ branchId: branchPune.id }] },
    },
  });

  const salesAndheri = await prisma.user.create({
    data: {
      name: "Anita Desai",
      mobile: "9876543212",
      email: "anita.desai@mgrcasa.in",
      passwordHash: await hash("sales123"),
      roleId: roleSales.id,
      branchId: branchAndheri.id,
      isActive: true,
      userBranches: { create: [{ branchId: branchAndheri.id }] },
    },
  });

  const salesPune = await prisma.user.create({
    data: {
      name: "Vikram Joshi",
      mobile: "9876543213",
      email: "vikram.joshi@mgrcasa.in",
      passwordHash: await hash("sales123"),
      roleId: roleSales.id,
      branchId: branchPune.id,
      isActive: true,
      userBranches: { create: [{ branchId: branchPune.id }] },
    },
  });

  const deliveryCoord = await prisma.user.create({
    data: {
      name: "Sneha Reddy",
      mobile: "9876543214",
      email: "sneha.reddy@mgrcasa.in",
      passwordHash: await hash("delivery123"),
      roleId: roleDelivery.id,
      branchId: branchAndheri.id,
      isActive: true,
      userBranches: { create: allBranchIds.map((branchId) => ({ branchId })) },
    },
  });

  await prisma.setting.create({
    data: {
      companyName: "MGR Casa Furniture",
      gstNumber: "27AABCM1234A1Z5",
      address: "Lokhandwala Complex, Andheri West, Mumbai 400053",
      phone: "022-26361234",
      email: "info@mgrcasa.in",
      defaultGstPercent: D(18),
      invoicePrefix: "MGR",
    },
  });

  // ——— Categories ———
  const catLiving = await prisma.category.create({ data: { name: "Living Room" } });
  const catBed = await prisma.category.create({ data: { name: "Bedroom" } });
  const catDining = await prisma.category.create({ data: { name: "Dining" } });
  const catOffice = await prisma.category.create({ data: { name: "Office" } });
  const catSofas = await prisma.category.create({ data: { name: "Sofas", parentId: catLiving.id } });
  const catBeds = await prisma.category.create({ data: { name: "Beds", parentId: catBed.id } });
  const catTables = await prisma.category.create({ data: { name: "Tables", parentId: catDining.id } });

  await prisma.attributeKey.create({
    data: {
      name: "Color",
      options: {
        create: [{ value: "Charcoal Grey" }, { value: "Sand Beige" }, { value: "Walnut Brown" }, { value: "Ivory" }],
      },
    },
  });

  await prisma.attributeKey.create({
    data: {
      name: "Size",
      options: { create: [{ value: "Queen" }, { value: "King" }, { value: "3-Seater" }, { value: "L-Shaped" }] },
    },
  });

  // ——— Products ———
  const sofa = await prisma.product.create({
    data: {
      name: "Milano L-Shaped Sofa",
      sku: "SOFA-MIL-L",
      categoryId: catSofas.id,
      price: D(89999),
      gstPercent: D(18),
      stockQty: 0,
      lowStockThreshold: 2,
      description: "Premium fabric, solid teak legs, reversible chaise",
    },
  });

  const bedQueen = await prisma.product.create({
    data: {
      name: "Heritage Queen Bed with Storage",
      sku: "BED-HER-Q",
      categoryId: catBeds.id,
      price: D(54999),
      gstPercent: D(18),
      stockQty: 8,
      lowStockThreshold: 2,
      description: "Hydraulic storage, engineered wood",
    },
  });

  const bedKing = await prisma.product.create({
    data: {
      name: "Heritage King Bed with Storage",
      sku: "BED-HER-K",
      categoryId: catBeds.id,
      price: D(62999),
      gstPercent: D(18),
      stockQty: 4,
      lowStockThreshold: 2,
      description: "King size hydraulic storage",
    },
  });

  const diningSet = await prisma.product.create({
    data: {
      name: "Aurelia 6-Seater Dining Set",
      sku: "DINE-AUR-6",
      categoryId: catTables.id,
      price: D(72499),
      gstPercent: D(18),
      stockQty: 3,
      lowStockThreshold: 1,
      description: "Table + 6 chairs, marble top",
    },
  });

  const desk = await prisma.product.create({
    data: {
      name: "Studio Work Desk",
      sku: "DESK-STU-01",
      categoryId: catOffice.id,
      price: D(18999),
      gstPercent: D(18),
      stockQty: 1,
      lowStockThreshold: 3,
      description: "Compact desk — low stock alert demo",
    },
  });

  const curtainFabric = await prisma.product.create({
    data: {
      name: "Blackout Curtain Fabric (per metre)",
      sku: "CUR-BLK-M",
      categoryId: catLiving.id,
      price: D(899),
      gstPercent: D(12),
      stockQty: 120,
      lowStockThreshold: 20,
      description: "Used with curtain calculator orders",
    },
  });

  await prisma.productVariant.createMany({
    data: [
      {
        productId: sofa.id,
        name: "Charcoal Grey — L-Left",
        sku: "SOFA-MIL-L-CG",
        price: D(91999),
        stockQty: 2,
        lowStockThreshold: 1,
        attributes: JSON.stringify({ Color: "Charcoal Grey", Size: "L-Shaped" }),
        isActive: true,
      },
      {
        productId: sofa.id,
        name: "Sand Beige — L-Right",
        sku: "SOFA-MIL-L-SB",
        price: D(89999),
        stockQty: 3,
        lowStockThreshold: 1,
        attributes: JSON.stringify({ Color: "Sand Beige", Size: "L-Shaped" }),
        isActive: true,
      },
    ],
  });
  await syncProductStockFromVariants(sofa.id);

  // Opening stock logs per branch
  for (const [branch, products] of [
    [branchAndheri, [sofa, bedQueen, diningSet, desk]] as const,
    [branchPune, [bedKing, diningSet, curtainFabric]] as const,
    [branchThane, [sofa, bedQueen, curtainFabric]] as const,
  ]) {
    for (const p of products) {
      const qty = p.id === desk.id ? 1 : p.id === sofa.id ? 5 : 4;
      await prisma.inventoryLog.create({
        data: {
          productId: p.id,
          branchId: branch.id,
          type: "in",
          quantity: qty,
          notes: `Opening stock — ${branch.code}`,
        },
      });
    }
  }

  // ——— Suppliers & manufacturers ———
  const supplier = await prisma.supplier.create({
    data: {
      name: "Maharashtra Timber Traders",
      contactPerson: "Rajesh Kulkarni",
      mobile: "9822012345",
      email: "rajesh@mttply.in",
      address: "Bhiwandi, Thane District",
      gstNumber: "27AABCT5678B1Z3",
      isActive: true,
    },
  });

  const supplier2 = await prisma.supplier.create({
    data: {
      name: "Fabric House India",
      contactPerson: "Meena Iyer",
      mobile: "9822098765",
      email: "orders@fabrichouse.in",
      address: "Surat, Gujarat",
      gstNumber: "24AABCF9012C1Z8",
      isActive: true,
    },
  });

  const manufacturer = await prisma.manufacturer.create({
    data: {
      name: "FineWood Manufacturing Co.",
      contactPerson: "Ajit Patil",
      mobile: "9823011122",
      email: "production@finewood.in",
      address: "Chakan MIDC, Pune",
      specialization: "Solid wood & veneer furniture",
      isActive: true,
    },
  });

  await prisma.user.create({
    data: {
      name: "MTT Supplier Portal",
      mobile: "9876511111",
      email: "portal@mttply.in",
      passwordHash: await hash("supplier123"),
      roleId: roleSupplierPortal.id,
      supplierId: supplier.id,
      isActive: true,
    },
  });

  await prisma.user.create({
    data: {
      name: "FineWood Portal",
      mobile: "9876522222",
      email: "portal@finewood.in",
      passwordHash: await hash("mfg123"),
      roleId: roleManufacturerPortal.id,
      manufacturerId: manufacturer.id,
      isActive: true,
    },
  });

  // ——— Delivery slots (today + next 6 days per branch) ———
  type SlotTemplate = { label: string; start: string; end: string; max: number; pincodes: string[] };
  const slotTemplates: SlotTemplate[] = [
    { label: "Morning", start: "10:00", end: "13:00", max: 4, pincodes: ["400053", "400058", "400061"] },
    { label: "Afternoon", start: "14:00", end: "17:00", max: 5, pincodes: ["400053", "400607", "400601"] },
    { label: "Evening", start: "18:00", end: "21:00", max: 3, pincodes: [] },
  ];

  const branchPincodeMap: Record<number, string[]> = {
    [branchAndheri.id]: ["400053", "400058", "400061"],
    [branchPune.id]: ["411001", "411014", "411045"],
    [branchThane.id]: ["400601", "400607", "421201"],
  };

  const slotByBranchDay = new Map<string, number>();

  for (const branch of [branchAndheri, branchPune, branchThane]) {
    const pins = branchPincodeMap[branch.id] ?? [];
    for (let day = 0; day < 7; day++) {
      const slotDate = utcDateOnly(day);
      for (const tpl of slotTemplates) {
        const servicePincodes = JSON.stringify(tpl.pincodes.length ? tpl.pincodes : pins);
        const slot = await prisma.deliverySlot.create({
          data: {
            branchId: branch.id,
            slotDate,
            label: tpl.label,
            startTime: tpl.start,
            endTime: tpl.end,
            maxOrders: tpl.max,
            servicePincodes,
          },
        });
        slotByBranchDay.set(`${branch.id}:${day}:${tpl.label}`, slot.id);
      }
    }
  }

  const slotAndheriTodayMorning = slotByBranchDay.get(`${branchAndheri.id}:0:Morning`)!;
  const slotAndheriTomorrowAfternoon = slotByBranchDay.get(`${branchAndheri.id}:1:Afternoon`)!;
  const slotPuneTodayMorning = slotByBranchDay.get(`${branchPune.id}:0:Morning`)!;
  const slotThaneDay2Evening = slotByBranchDay.get(`${branchThane.id}:2:Evening`)!;

  // ——— Helper: GST line totals ———
  function lineTotals(unitPrice: number, qty: number, gstPct: number) {
    const sub = unitPrice * qty;
    const tax = (sub * gstPct) / 100;
    return { sub, tax, total: sub + tax };
  }

  // ——— Orders ———
  const ordersSpec: Array<{
    orderNumber: string;
    customerName: string;
    mobile: string;
    address: string;
    pincode: string;
    branchId: number;
    status: string;
    deliveryStatus: string;
    deliveryDate?: Date;
    deliverySlotId?: number;
    isGst: boolean;
    gstNumber?: string;
    createdById: number;
    assignedToId: number;
    assigneeIds: number[];
    items: { productId: number; qty: number; unit: number; gst: number }[];
    paidFraction: number;
    paymentMode?: string;
    createdAt?: Date;
  }> = [
    {
      orderNumber: "MGR-2026-0001",
      customerName: "Amit & Priya Shah",
      mobile: "9819001122",
      address: "Flat 902, Oberoi Springs, Andheri West",
      pincode: "400058",
      branchId: branchAndheri.id,
      status: "complete",
      deliveryStatus: "delivered",
      deliveryDate: daysAgo(3),
      deliverySlotId: slotAndheriTodayMorning,
      isGst: true,
      gstNumber: "27AABCS1234D1Z9",
      createdById: salesAndheri.id,
      assignedToId: deliveryCoord.id,
      assigneeIds: [salesAndheri.id, deliveryCoord.id],
      items: [{ productId: sofa.id, qty: 1, unit: 76271.19, gst: 18 }],
      paidFraction: 1,
      paymentMode: "upi",
      createdAt: daysAgo(10),
    },
    {
      orderNumber: "MGR-2026-0002",
      customerName: "Rohan Kapoor",
      mobile: "9820033445",
      address: "B-204, Hiranandani Meadows, Thane",
      pincode: "400607",
      branchId: branchThane.id,
      status: "ready_to_ship",
      deliveryStatus: "out_for_delivery",
      deliveryDate: utcDateOnly(0),
      deliverySlotId: slotThaneDay2Evening,
      isGst: false,
      createdById: mgrAndheri.id,
      assignedToId: deliveryCoord.id,
      assigneeIds: [deliveryCoord.id],
      items: [
        { productId: bedQueen.id, qty: 1, unit: 46609.32, gst: 18 },
        { productId: curtainFabric.id, qty: 12, unit: 803.57, gst: 12 },
      ],
      paidFraction: 0.5,
      paymentMode: "cash",
      createdAt: daysAgo(5),
    },
    {
      orderNumber: "MGR-2026-0003",
      customerName: "Sunita Menon",
      mobile: "9831055667",
      address: "14, Koregaon Park, Pune",
      pincode: "411001",
      branchId: branchPune.id,
      status: "ready_to_ship",
      deliveryStatus: "pending",
      deliveryDate: utcDateOnly(1),
      deliverySlotId: slotPuneTodayMorning,
      isGst: true,
      gstNumber: "27AABCM9876E1Z2",
      createdById: salesPune.id,
      assignedToId: salesPune.id,
      assigneeIds: [salesPune.id],
      items: [{ productId: diningSet.id, qty: 1, unit: 61439.83, gst: 18 }],
      paidFraction: 0.3,
      paymentMode: "card",
      createdAt: daysAgo(4),
    },
    {
      orderNumber: "MGR-2026-0004",
      customerName: "Deepak Verma",
      mobile: "9842067788",
      address: "Shop 3, Lokhandwala Market, Andheri",
      pincode: "400053",
      branchId: branchAndheri.id,
      status: "manufacturing",
      deliveryStatus: "pending",
      deliveryDate: utcDateOnly(2),
      deliverySlotId: slotAndheriTomorrowAfternoon,
      isGst: false,
      createdById: salesAndheri.id,
      assignedToId: salesAndheri.id,
      assigneeIds: [salesAndheri.id, mgrAndheri.id],
      items: [{ productId: sofa.id, qty: 1, unit: 76271.19, gst: 18 }],
      paidFraction: 0.2,
      createdAt: daysAgo(2),
    },
    {
      orderNumber: "MGR-2026-0005",
      customerName: "Neha Agarwal",
      mobile: "9853079900",
      address: "7th Floor, Bandra Kurla Complex Annexe",
      pincode: "400051",
      branchId: branchAndheri.id,
      status: "order_received",
      deliveryStatus: "pending",
      deliveryDate: utcDateOnly(3),
      isGst: true,
      gstNumber: "27AABCA4321F1Z1",
      createdById: salesAndheri.id,
      assignedToId: salesAndheri.id,
      assigneeIds: [salesAndheri.id],
      items: [
        { productId: desk.id, qty: 1, unit: 16101.69, gst: 18 },
        { productId: curtainFabric.id, qty: 8, unit: 803.57, gst: 12 },
      ],
      paidFraction: 0,
      createdAt: daysAgo(1),
    },
    {
      orderNumber: "MGR-2026-0006",
      customerName: "Kiran Deshmukh",
      mobile: "9864081122",
      address: "Row House 8, Magarpatta City, Pune",
      pincode: "411028",
      branchId: branchPune.id,
      status: "order_received",
      deliveryStatus: "pending",
      isGst: false,
      createdById: mgrPune.id,
      assignedToId: mgrPune.id,
      assigneeIds: [mgrPune.id, salesPune.id],
      items: [{ productId: bedKing.id, qty: 1, unit: 53389.83, gst: 18 }],
      paidFraction: 0.1,
      paymentMode: "upi",
      createdAt: daysAgo(0),
    },
    {
      orderNumber: "MGR-2026-0007",
      customerName: "Cancelled Demo Client",
      mobile: "9875099900",
      address: "Test address, Mumbai",
      pincode: "400001",
      branchId: branchAndheri.id,
      status: "cancelled",
      deliveryStatus: "pending",
      isGst: false,
      createdById: salesAndheri.id,
      assignedToId: salesAndheri.id,
      assigneeIds: [],
      items: [{ productId: desk.id, qty: 1, unit: 16101.69, gst: 18 }],
      paidFraction: 0,
      createdAt: daysAgo(7),
    },
  ];

  let invoiceSeq = 1;

  for (const spec of ordersSpec) {
    let subtotal = 0;
    let taxAmount = 0;
    for (const it of spec.items) {
      const { sub, tax } = lineTotals(it.unit, it.qty, it.gst);
      subtotal += sub;
      taxAmount += tax;
    }
    const totalAmount = subtotal + taxAmount;
    const paidAmount = totalAmount * spec.paidFraction;
    const paymentStatus =
      paidAmount <= 0 ? "due" : paidAmount >= totalAmount ? "paid" : "partial";

    const order = await prisma.order.create({
      data: {
        orderNumber: spec.orderNumber,
        customerName: spec.customerName,
        customerMobile: spec.mobile,
        customerAddress: spec.address,
        customerPincode: spec.pincode,
        isGst: spec.isGst,
        customerGstNumber: spec.gstNumber,
        status: spec.status,
        deliveryStatus: spec.deliveryStatus,
        paymentStatus,
        deliveryDate: spec.deliveryDate,
        deliverySlotId: spec.deliverySlotId,
        subtotal: D(subtotal),
        taxAmount: D(taxAmount),
        totalAmount: D(totalAmount),
        paidAmount: D(paidAmount),
        advanceAmount: D(paidAmount),
        paymentMode: spec.paymentMode,
        branchId: spec.branchId,
        createdById: spec.createdById,
        assignedToId: spec.assignedToId,
        staffComments: spec.status === "cancelled" ? "Customer postponed project" : null,
        notes: `Seed order — ${spec.orderNumber}`,
        createdAt: spec.createdAt ?? new Date(),
        updatedAt: spec.createdAt ?? new Date(),
        items: {
          create: spec.items.map((it) => {
            const { total } = lineTotals(it.unit, it.qty, it.gst);
            return {
              productId: it.productId,
              quantity: it.qty,
              unitPrice: D(it.unit),
              gstPercent: D(it.gst),
              totalPrice: D(total),
            };
          }),
        },
        assignees: {
          create: spec.assigneeIds.map((userId) => ({ userId })),
        },
      },
    });

    if (spec.status === "complete" && spec.paidFraction >= 1) {
      const half = taxAmount / 2;
      await prisma.invoice.create({
        data: {
          invoiceNumber: `MGR-INV-2026-${String(invoiceSeq++).padStart(4, "0")}`,
          orderId: order.id,
          isGst: spec.isGst,
          cgst: D(half),
          sgst: D(half),
          igst: D(0),
          totalAmount: D(totalAmount),
        },
      });
      await prisma.payment.create({
        data: {
          orderId: order.id,
          amount: D(totalAmount),
          mode: spec.paymentMode ?? "upi",
          notes: "Full payment at delivery",
        },
      });
      for (const it of spec.items) {
        try {
          await decrementProductStock(it.productId, it.qty);
          await prisma.inventoryLog.create({
            data: {
              productId: it.productId,
              branchId: spec.branchId,
              type: "out",
              quantity: it.qty,
              notes: spec.orderNumber,
            },
          });
        } catch {
          /* stock may be low on variants — skip for seed */
        }
      }
    } else if (paidAmount > 0) {
      await prisma.payment.create({
        data: {
          orderId: order.id,
          amount: D(paidAmount),
          mode: spec.paymentMode ?? "cash",
          notes: "Advance / partial payment",
        },
      });
    }
  }

  // ——— Purchase orders ———
  await prisma.purchaseOrder.create({
    data: {
      poNumber: "PO-MGR-2026-010",
      type: "supplier",
      supplierId: supplier.id,
      status: "confirmed",
      totalAmount: D(240000),
      expectedDelivery: utcDateOnly(5),
      notes: "Teak legs & frames — Andheri replenishment",
      branchId: branchAndheri.id,
      items: {
        create: [
          { productId: sofa.id, quantity: 4, unitPrice: D(35000) },
          { productId: bedQueen.id, quantity: 6, unitPrice: D(22000) },
        ],
      },
    },
  });

  await prisma.purchaseOrder.create({
    data: {
      poNumber: "PO-MGR-2026-011",
      type: "supplier",
      supplierId: supplier2.id,
      status: "in_production",
      totalAmount: D(45000),
      expectedDelivery: utcDateOnly(8),
      notes: "Fabric rolls for Q2 collections",
      branchId: branchPune.id,
      items: {
        create: [{ productId: curtainFabric.id, quantity: 50, unitPrice: D(900) }],
      },
    },
  });

  const poDelivered = await prisma.purchaseOrder.create({
    data: {
      poNumber: "PO-MGR-2026-009",
      type: "manufacturer",
      manufacturerId: manufacturer.id,
      status: "delivered",
      totalAmount: D(180000),
      expectedDelivery: daysAgo(2),
      notes: "Dining sets received at Pune warehouse",
      branchId: branchPune.id,
      items: {
        create: [{ productId: diningSet.id, quantity: 3, unitPrice: D(60000) }],
      },
    },
  });

  await prisma.purchaseOrder.create({
    data: {
      poNumber: "PO-MGR-2026-012",
      type: "manufacturer",
      manufacturerId: manufacturer.id,
      status: "shipped",
      totalAmount: D(95000),
      branchId: branchThane.id,
      items: {
        create: [{ productId: bedKing.id, quantity: 5, unitPrice: D(19000) }],
      },
    },
  });

  await prisma.purchaseOrder.create({
    data: {
      poNumber: "PO-MGR-2026-013",
      type: "supplier",
      supplierId: supplier.id,
      status: "cancelled",
      totalAmount: D(12000),
      notes: "Cancelled — duplicate request",
      branchId: branchAndheri.id,
      items: {
        create: [{ productId: desk.id, quantity: 2, unitPrice: D(6000) }],
      },
    },
  });

  // Inbound stock for delivered PO (matches status-patch behaviour)
  const deliveredItems = await prisma.purchaseOrderItem.findMany({
    where: { purchaseOrderId: poDelivered.id },
  });
  for (const item of deliveredItems) {
    await incrementProductStock(item.productId, item.quantity);
    await prisma.inventoryLog.create({
      data: {
        productId: item.productId,
        branchId: branchPune.id,
        type: "in",
        quantity: item.quantity,
        notes: `PO ${poDelivered.poNumber} delivered`,
      },
    });
  }

  // ——— Sample notifications ———
  await prisma.notificationTypeDefinition.createMany({
    data: [
      { code: "ORDER_CREATED", label: "New order", description: "A sales order was created" },
      { code: "ORDER_STATUS_CHANGED", label: "Order status", description: "Order status changed" },
      { code: "ORDER_DELIVERY_UPDATED", label: "Delivery update", description: "Delivery status changed" },
      { code: "DELIVERY_REMINDER", label: "Delivery reminder", description: "Order scheduled for delivery today" },
      { code: "PAYMENT_RECEIVED", label: "Payment received", description: "Payment recorded on an order" },
      { code: "PAYMENT_REMINDER", label: "Payment reminder", description: "Payment follow-up due or overdue" },
      { code: "COMPLAINT_CREATED", label: "New complaint", description: "Customer complaint opened" },
      { code: "COMPLAINT_STATUS_CHANGED", label: "Complaint status", description: "Complaint status changed" },
      { code: "COMPLAINT_COMMENT_ADDED", label: "Complaint comment", description: "New comment on a complaint" },
      { code: "PURCHASE_ORDER_CREATED", label: "Purchase order created", description: "New purchase order for supplier or manufacturer" },
      { code: "PURCHASE_ORDER_UPDATED", label: "Purchase order updated", description: "Purchase order details changed by HQ" },
      { code: "PURCHASE_ORDER_STATUS_CHANGED", label: "Purchase order status", description: "Purchase order status changed" },
      { code: "inventory.low", label: "Low stock", description: "Product below threshold" },
    ],
    skipDuplicates: true,
  });

  const notif = await prisma.notification.create({
    data: {
      title: "Deliveries today",
      message: "3 orders scheduled for delivery across Andheri and Thane branches.",
      senderId: admin.id,
      notificationType: "delivery.updated",
      module: "deliveries",
      priority: "normal",
      isBroadcast: false,
      recipients: {
        create: [{ userId: deliveryCoord.id }, { userId: mgrAndheri.id }],
      },
    },
  });

  await prisma.notificationRecipient.updateMany({
    where: { notificationId: notif.id, userId: mgrAndheri.id },
    data: { isRead: true, readAt: new Date() },
  });

  console.log("Seed complete.\n");
  console.log("Branches: Andheri (ANDH), Pune (PUNE), Thane (THNE)");
  console.log("Delivery slots: 7 days × 3 slots × 3 branches");
  console.log(`Orders: ${ordersSpec.length} (mixed status + delivery pipeline)`);
  console.log("Purchase orders: 5 (pending → delivered)\n");
  console.log("── Login credentials (password) ──");
  console.log("  Super Admin     9999999999  admin123");
  console.log("  Branch Mgr      9876543210  mgr123    (Andheri + Thane)");
  console.log("  Branch Mgr      9876543211  mgr123    (Pune)");
  console.log("  Sales           9876543212  sales123  (Andheri)");
  console.log("  Sales           9876543213  sales123  (Pune)");
  console.log("  Delivery        9876543214  delivery123 (all branches)");
  console.log("  Supplier portal 9876511111  supplier123");
  console.log("  Manufacturer    9876522222  mfg123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
