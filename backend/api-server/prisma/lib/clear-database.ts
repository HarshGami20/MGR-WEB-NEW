import type { PrismaClient } from "@prisma/client";

/** Deletes all application rows in FK-safe order. */
export async function clearDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.notificationRecipient.deleteMany();
  await prisma.notificationLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.notificationPreference.deleteMany();
  await prisma.userFcmToken.deleteMany();
  await prisma.complaintComment.deleteMany();
  await prisma.complaintAssignee.deleteMany();
  await prisma.complaint.deleteMany();
  await prisma.paymentFollowUp.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.driverPayment.deleteMany();
  await prisma.orderDeliveryAssignee.deleteMany();
  await prisma.orderAssignee.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.driver.deleteMany();
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
