import { copyDeliveryReminder, copyPaymentReminder, withActionMeta } from "../lib/notification-copy";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import {
  orderNotificationTargets,
  reminderAlreadySentToday,
  startOfUtcDay,
  utcDayKey,
  usersWithModuleRead,
} from "../lib/notification-targets";
import { notificationService } from "../services/notification-service";

const PENDING_PAYMENT_STATUSES = ["due", "partially_paid"] as const;
const ACTIVE_DELIVERY_STATUSES = ["pending", "out_for_delivery"] as const;

const evLog = logger.child({ ns: "notifications", layer: "reminders" });

function endOfUtcDay(d: Date): Date {
  const start = startOfUtcDay(d);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
}

async function runPaymentReminders(today: Date): Promise<void> {
  const rows = await prisma.paymentFollowUp.findMany({
    where: {
      followUpDate: { lte: today },
      order: { paymentStatus: { in: [...PENDING_PAYMENT_STATUSES] } },
    },
    include: {
      order: { select: { id: true, orderNumber: true, branchId: true } },
    },
  });

  const dayKey = utcDayKey(today);
  for (const row of rows) {
    const order = row.order;
    if (!order) continue;
    const dedupeKey = `payment:${row.id}:${dayKey}`;
    if (await reminderAlreadySentToday("PAYMENT_REMINDER", dedupeKey)) continue;

    const targets = await orderNotificationTargets(order.id);
    if (targets.length === 0) continue;

    const overdue = row.followUpDate < today;
    const dateLabel = row.followUpDate.toISOString().slice(0, 10);
    const copy = copyPaymentReminder({
      orderId: order.id,
      orderNumber: order.orderNumber,
      followUpDate: dateLabel,
      overdue,
    });
    await notificationService.sendToUsers(targets, {
      title: copy.title,
      message: copy.message,
      notificationType: "PAYMENT_REMINDER",
      module: "payments",
      priority: overdue ? "high" : "normal",
      metadata: withActionMeta(copy.actionPath, {
        dedupeKey,
        orderId: order.id,
        orderNumber: order.orderNumber,
        followUpId: row.id,
        followUpDate: dateLabel,
        overdue,
        branchId: order.branchId,
      }),
    });
    evLog.info({ orderId: order.id, followUpId: row.id, overdue }, "payment reminder sent");
  }
}

async function runDeliveryReminders(today: Date): Promise<void> {
  const dayEnd = endOfUtcDay(today);
  const orders = await prisma.order.findMany({
    where: {
      deliveryDate: { gte: today, lte: dayEnd },
      deliveryStatus: { in: [...ACTIVE_DELIVERY_STATUSES] },
    },
    select: {
      id: true,
      orderNumber: true,
      branchId: true,
      deliveryStatus: true,
      deliveryDate: true,
    },
  });

  const deliveryStaff = await usersWithModuleRead("deliveries", null);
  const dayKey = utcDayKey(today);

  for (const order of orders) {
    const dedupeKey = `delivery:${order.id}:${dayKey}`;
    if (await reminderAlreadySentToday("DELIVERY_REMINDER", dedupeKey)) continue;

    const targets = new Set<number>();
    for (const id of await orderNotificationTargets(order.id)) targets.add(id);
    const branchDelivery =
      order.branchId != null
        ? await usersWithModuleRead("deliveries", order.branchId)
        : deliveryStaff;
    for (const id of branchDelivery) targets.add(id);

    if (targets.size === 0) continue;

    const copy = copyDeliveryReminder({
      orderId: order.id,
      orderNumber: order.orderNumber,
      deliveryStatus: order.deliveryStatus,
    });
    await notificationService.sendToUsers([...targets], {
      title: copy.title,
      message: copy.message,
      notificationType: "DELIVERY_REMINDER",
      module: "deliveries",
      priority: "normal",
      metadata: withActionMeta(copy.actionPath, {
        dedupeKey,
        orderId: order.id,
        orderNumber: order.orderNumber,
        deliveryStatus: order.deliveryStatus,
        deliveryDate: dayKey,
        branchId: order.branchId,
      }),
    });
    evLog.info({ orderId: order.id }, "delivery reminder sent");
  }
}

export async function runDailyNotificationReminders(): Promise<void> {
  const today = startOfUtcDay(new Date());
  try {
    await runPaymentReminders(today);
    await runDeliveryReminders(today);
  } catch (err) {
    logger.error({ err }, "daily notification reminders failed");
  }
}

const MS_DAY = 24 * 60 * 60 * 1000;

/** Runs payment + delivery reminders once per UTC day while the API process is up. */
export function startNotificationReminderScheduler(): void {
  if (process.env["NOTIFICATION_REMINDERS"] === "0" || process.env["NOTIFICATION_REMINDERS"] === "false") {
    logger.info("notification reminder scheduler disabled (NOTIFICATION_REMINDERS=0)");
    return;
  }

  const run = () => void runDailyNotificationReminders();

  const now = new Date();
  const nextUtcMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const msUntilMidnight = nextUtcMidnight.getTime() - now.getTime();

  setTimeout(() => {
    void run();
    setInterval(run, MS_DAY);
  }, msUntilMidnight);

  void run();
  logger.info({ firstRunInMs: msUntilMidnight }, "notification reminder scheduler started");
}
