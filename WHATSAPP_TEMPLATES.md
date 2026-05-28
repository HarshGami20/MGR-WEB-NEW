# WhatsApp template messages — setup guide

This document explains how **order WhatsApp notifications** work in Blue-Schema-Manager, which **Meta (Facebook) templates** the API expects, and how to configure **`WHATSAPP_*` environment variables** in `backend/api-server/.env`.

Paths below are relative to `Blue-Schema-Manager/`.

---

## 1. Overview

When an order event occurs, the API sends **approved WhatsApp template messages** to every **order assignee** who has a valid mobile number on their user profile. Each assignee gets a **personalized** message (`recipient_name`).

| ERP event | API domain event | Default Meta template name | Language (default) |
|-----------|------------------|----------------------------|--------------------|
| Order created | `ORDER_CREATED` | `mgr_carsa_order_managment` | `en_US` |
| Order status changed | `ORDER_STATUS_CHANGED` | `mgr_job_status_guj` | `en` |
| Order edited (customer, items, assignees, etc.) | `ORDER_UPDATED` | `mgr_order_updated_guj` | `en` |
| Payment recorded | `PAYMENT_RECEIVED` | `mgr_payment_status_guj` | `en` |
| Order payment status changed | `ORDER_PAYMENT_STATUS_CHANGED` | `mgr_order_payment_status_guj` | `gu` |
| Delivery status changed | `ORDER_DELIVERY_UPDATED` | `mgr_delivery_status_en` | `en` |
| Staff comment added | `ORDER_STAFF_COMMENT_ADDED` | `mgr_order_comment_en` | `en` |
| Purchase order created | `PURCHASE_ORDER_CREATED` | `mgr_po_created_guj` | `gu` |
| Purchase order updated | `PURCHASE_ORDER_UPDATED` | `mgr_po_updated_guj` | `gu` |
| Purchase order status changed | `PURCHASE_ORDER_STATUS_CHANGED` | `mgr_po_status_guj` | `gu` |
| Inventory / stock updated | `INVENTORY_UPDATED` | `mgr_inventory_updated_guj` | `gu` |

Sending runs on the **backend only** (never from the browser). Implementation:

| File | Role |
|------|------|
| [`backend/api-server/src/listeners/whatsapp-listeners.ts`](backend/api-server/src/listeners/whatsapp-listeners.ts) | Subscribes to order events and triggers sends |
| [`backend/api-server/src/services/whatsapp-service.ts`](backend/api-server/src/services/whatsapp-service.ts) | Calls Meta Graph API `/{phone-number-id}/messages` |
| [`backend/api-server/src/lib/whatsapp-templates.ts`](backend/api-server/src/lib/whatsapp-templates.ts) | Builds template name, language, and parameters |
| [`backend/api-server/src/lib/whatsapp-order-recipients.ts`](backend/api-server/src/lib/whatsapp-order-recipients.ts) | Resolves assignee phone numbers |
| [`backend/api-server/src/routes/orders.ts`](backend/api-server/src/routes/orders.ts) | Emits order / delivery / comment events |
| [`backend/api-server/src/routes/payments.ts`](backend/api-server/src/routes/payments.ts) | Emits `PAYMENT_RECEIVED` |
| [`backend/api-server/src/routes/purchaseOrders.ts`](backend/api-server/src/routes/purchaseOrders.ts) | Emits purchase order events |
| [`backend/api-server/src/lib/whatsapp-po-recipients.ts`](backend/api-server/src/lib/whatsapp-po-recipients.ts) | PO partner + creator phone resolution |
| [`backend/api-server/src/lib/whatsapp-inventory-recipients.ts`](backend/api-server/src/lib/whatsapp-inventory-recipients.ts) | Super Admin phones only |
| [`backend/api-server/src/routes/inventory.ts`](backend/api-server/src/routes/inventory.ts) | Inventory adjust + emits `INVENTORY_UPDATED` |

Listeners are registered in [`backend/api-server/src/index.ts`](backend/api-server/src/index.ts) via `registerWhatsAppEventListeners()`.

---

## 2. Environment variables

Add these to **`backend/api-server/.env`** (not the frontend `.env`).

### Required (to send messages)

| Variable | Description | Example |
|----------|-------------|---------|
| `WHATSAPP_ENABLED` | Master switch. Set `false` or `0` to disable without removing other vars. | `true` |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta **Phone number ID** (from WhatsApp → API Setup). | `1167875749731963` |
| `WHATSAPP_ACCESS_TOKEN` | Permanent or long-lived token from Meta Business / System User. | `EAA...` |
| `WHATSAPP_API_VERSION` | Graph API version segment in the URL. | `v25.0` |

Messages are sent only when **`WHATSAPP_ENABLED` is not off** and both **`WHATSAPP_ACCESS_TOKEN`** and **`WHATSAPP_PHONE_NUMBER_ID`** are set.

### Optional — override template names and languages

Use these if your approved templates in Meta use **different names** or **language codes** than the defaults.

| Variable | Used for event | Default if unset |
|----------|----------------|------------------|
| `WHATSAPP_TEMPLATE_ORDER_CREATED` | Order created | `mgr_carsa_order_managment` |
| `WHATSAPP_TEMPLATE_ORDER_CREATED_LANG` | Order created language | `en_US` |
| `WHATSAPP_TEMPLATE_ORDER_STATUS` | Status change | `mgr_job_status_guj` |
| `WHATSAPP_TEMPLATE_ORDER_STATUS_LANG` | Status change language | `en` |
| `WHATSAPP_TEMPLATE_ORDER_UPDATED` | Order update | `mgr_order_updated_guj` |
| `WHATSAPP_TEMPLATE_ORDER_UPDATED_LANG` | Order update language | `en` |
| `WHATSAPP_TEMPLATE_PAYMENT_RECEIVED` | Payment recorded | `mgr_payment_status_guj` |
| `WHATSAPP_TEMPLATE_PAYMENT_RECEIVED_LANG` | Payment template language | `en` |
| `WHATSAPP_TEMPLATE_ORDER_PAYMENT_STATUS_CHANGED` | Order payment status changed | `mgr_order_payment_status_guj` |
| `WHATSAPP_TEMPLATE_ORDER_PAYMENT_STATUS_CHANGED_LANG` | Order payment status language | `gu` |
| `WHATSAPP_TEMPLATE_DELIVERY_UPDATED` | Delivery status | `mgr_delivery_status_en` |
| `WHATSAPP_TEMPLATE_DELIVERY_UPDATED_LANG` | Delivery template language | `en` |
| `WHATSAPP_TEMPLATE_ORDER_COMMENT` | Staff comment | `mgr_order_comment_en` |
| `WHATSAPP_TEMPLATE_ORDER_COMMENT_LANG` | Comment template language | `en` |
| `WHATSAPP_TEMPLATE_PO_CREATED` | PO created | `mgr_po_created_guj` |
| `WHATSAPP_TEMPLATE_PO_CREATED_LANG` | PO created language | `gu` |
| `WHATSAPP_TEMPLATE_PO_UPDATED` | PO updated | `mgr_po_updated_guj` |
| `WHATSAPP_TEMPLATE_PO_UPDATED_LANG` | PO updated language | `gu` |
| `WHATSAPP_TEMPLATE_PO_STATUS` | PO status | `mgr_po_status_guj` |
| `WHATSAPP_TEMPLATE_PO_STATUS_LANG` | PO status language | `gu` |
| `WHATSAPP_TEMPLATE_INVENTORY_UPDATED` | Inventory update | `mgr_inventory_updated_guj` |
| `WHATSAPP_TEMPLATE_INVENTORY_UPDATED_LANG` | Inventory template language | `gu` |

### Example `.env` block

```env
# WhatsApp Cloud API
WHATSAPP_ENABLED=true
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_API_VERSION=v25.0
WHATSAPP_ACCESS_TOKEN=your_meta_access_token

# Only if your Meta template names differ:
# WHATSAPP_TEMPLATE_ORDER_CREATED=my_order_created_template
# WHATSAPP_TEMPLATE_ORDER_CREATED_LANG=en_US
# WHATSAPP_TEMPLATE_ORDER_STATUS=my_status_template
# WHATSAPP_TEMPLATE_ORDER_STATUS_LANG=en
# WHATSAPP_TEMPLATE_ORDER_UPDATED=my_order_updated_template
# WHATSAPP_TEMPLATE_ORDER_UPDATED_LANG=en
```

After changing `.env`, **restart the API server** (`npm run dev` in `backend/api-server`).

### Optional — dev / test mode

| Variable | Description |
|----------|-------------|
| `DEV_MODE` | Set `true` to redirect all WhatsApp sends to one test phone |
| `WHATSAPP_DEV_PHONE` | Test mobile (e.g. `917016353154`). Each message still uses the real assignee’s name in `recipient_name` |


---

## 3. Default templates — parameters the API sends

Template **names and parameter keys** must match what you configured in [Meta Business Suite](https://business.facebook.com/) → WhatsApp Manager → Message templates. If Meta rejects a send, compare your template’s variable names to the table below.

### 3.1 Order created — `mgr_carsa_order_managment`

**When:** New order saved (`POST /orders`).

**Recipients:** All users in **Order assignees** (with valid `User.mobile`).

| Component | Parameter name (Meta) | Value sent by API |
|-----------|-------------------------|-------------------|
| Body | `recipient_name` | Assignee receiving this message (personalized per person) |
| Body | `created_by_name` | User who created the order |
| Body | `branch_name` | Branch name (or `—` if none) |
| Body | `order_id` | `{orderNumber} \| {customerName} \| ₹{totalAmount}` |
| Button (URL, index 0) | dynamic URL suffix | Numeric order `id` (e.g. `42`) |

**Default language:** `en_US` (`WHATSAPP_TEMPLATE_ORDER_CREATED_LANG`).

---

### 3.2 Order status changed — `mgr_job_status_guj`

**When:** Main order status changes (`PATCH /orders/:id/status` or `PUT /orders/:id` with a new `status`).

**Recipients:** Same assignees as above.

| Component | Parameter name (Meta) | Value sent by API |
|-----------|-------------------------|-------------------|
| Body | `recipient_name` | Assignee receiving this message |
| Body | `branch_name` | Branch name (or `—` if none) |
| Body | `order_id` | `{orderNumber} (#{id})` |
| Body | `job_status` | Human-readable status (e.g. `Manufacturing`) |
| Body | `changed_by_name` | User who changed the status |
| Button (URL, index 0) | dynamic URL suffix | Numeric order `id` |

**Default language:** `en` (`WHATSAPP_TEMPLATE_ORDER_STATUS_LANG`).

---

### 3.3 Order updated — `mgr_order_updated_guj`

**When:** Order is edited via `PUT /orders/:id` and something other than **only** status or delivery status changed (customer, items/totals, assignees, address, payment fields, etc.).

**Recipients:** Same assignees.

| Component | Parameter name (Meta) | Value sent by API |
|-----------|-------------------------|-------------------|
| Body | `recipient_name` | Assignee receiving this message |
| Body | `branch_name` | Branch name (or `—` if none) |
| Body | `order_id` | `{orderNumber} \| {customerName}` |
| Body | `updated_by_name` | User who updated the order |
| Button (URL, index 0) | dynamic URL suffix | Numeric order `id` |

**Default language:** `en` (`WHATSAPP_TEMPLATE_ORDER_UPDATED_LANG`).

**Note:** A status-only update does **not** send this template; it sends the status template instead.

---

### 3.4 Payment received — `mgr_payment_status_guj`

**When:** Payment recorded (`POST /payments`).

| Component | Parameter name (Meta) | Value sent by API |
|-----------|-------------------------|-------------------|
| Body | `recipient_name` | Assignee receiving this message |
| Body | `branch_name` | Branch name |
| Body | `order_id` | `{orderNumber} \| ₹{amount} received` |
| Body | `payment_status` | `Due` / `Partially Paid` / `Paid` (after payment) |
| Body | `recorded_by_name` | User who recorded the payment |
| Button (URL, index 0) | dynamic URL suffix | Numeric order `id` |

---

### 3.4b Order payment status changed — `mgr_order_payment_status_guj`

**When:** Payment status updated on an order without a new payment row — `PATCH /orders/:id/payment-status`, `PATCH /orders/:id` with `paymentStatus`, or order edit that changes `paymentStatus`.

**Recipients:** Order assignees (same as other order WhatsApp alerts).

| Component | Parameter name (Meta) | Value sent by API |
|-----------|-------------------------|-------------------|
| Body | `recipient_name` | Assignee receiving this message |
| Body | `order_id` | `{orderNumber} (#{id})` |
| Body | `branch_name` | Branch name |
| Body | `previous_status` | `Due` / `Partially Paid` / `Paid` (before change) |
| Body | `new_status` | Status after change |
| Body | `changed_by_name` | User who changed the status |
| Button (URL, index 0) | dynamic URL suffix | Numeric order `id` (omit button component if your Meta template uses a **static** URL) |

**Button base URL:** `https://your-domain.com/orders/`

**Note:** `POST /payments` sends **3.4 Payment received** only (not this event), to avoid duplicate messages. Full copy for Meta submission: **§10.4b** below.

---

### 3.5 Delivery status — `mgr_delivery_status_en`

**When:** Delivery status changes (`PUT /orders/:id` or `PATCH /orders/:id/delivery`).

| Component | Parameter name (Meta) | Value sent by API |
|-----------|-------------------------|-------------------|
| Body | `recipient_name` | Assignee receiving this message |
| Body | `branch_name` | Branch name |
| Body | `order_id` | `{orderNumber} (#{id})` |
| Body | `delivery_status` | `Pending` / `Out for delivery` / `Delivered` |
| Body | `driver_name` | Assigned driver name (or `—`) |
| Body | `changed_by_name` | User who updated delivery |
| Button (URL, index 0) | dynamic URL suffix | Numeric order `id` |

---

### 3.6 Staff comment — `mgr_order_comment_en`

**When:** New staff comment saved on order (`PUT /orders/:id` with new `staffComments` entry).

| Component | Parameter name (Meta) | Value sent by API |
|-----------|-------------------------|-------------------|
| Body | `recipient_name` | Assignee receiving this message |
| Body | `branch_name` | Branch name |
| Body | `order_id` | `{orderNumber} (#{id})` |
| Body | `comment_by_name` | Author of the comment |
| Body | `comment_preview` | Comment text (max 240 chars) |
| Button (URL, index 0) | dynamic URL suffix | Numeric order `id` |

---

### 3.7 Purchase order created — `mgr_po_created_guj`

**When:** `POST /purchase-orders`.

**Recipients:** Supplier **or** manufacturer portal user(s) + **PO creator** (staff who created it).

| Component | Parameter name (Meta) | Value sent by API |
|-----------|-------------------------|-------------------|
| Body | `recipient_name` | User receiving the message |
| Body | `created_by_name` | Staff who created the PO |
| Body | `branch_name` | Branch name |
| Body | `partner_name` | Supplier or manufacturer company name |
| Body | `po_id` | `{poNumber} \| Supplier/Manufacturer: {name} \| ₹{total}` |
| Button (URL, index 0) | dynamic URL suffix | Numeric purchase order `id` |

**Button base URL:** `https://your-domain.com/purchase-orders/`

---

### 3.8 Purchase order updated — `mgr_po_updated_guj`

**When:** `PUT /purchase-orders/:id` (notes, expected delivery, staff comments).

**Recipients:** **PO creator only** (staff who originally created the PO).

| Component | Parameter name (Meta) | Value sent by API |
|-----------|-------------------------|-------------------|
| Body | `recipient_name` | PO creator name |
| Body | `updated_by_name` | User who edited the PO |
| Body | `branch_name` | Branch name |
| Body | `partner_name` | Supplier or manufacturer name |
| Body | `po_id` | `{poNumber} \| {partnerName}` |
| Button (URL, index 0) | dynamic URL suffix | Numeric purchase order `id` |

---

### 3.9 Purchase order status — `mgr_po_status_guj`

**When:** `PATCH /purchase-orders/:id/status`.

**Recipients:** Supplier/manufacturer portal user(s) + **PO creator**.

| Component | Parameter name (Meta) | Value sent by API |
|-----------|-------------------------|-------------------|
| Body | `recipient_name` | User receiving the message |
| Body | `branch_name` | Branch name |
| Body | `po_id` | `{poNumber} (#{id})` |
| Body | `po_status` | Human-readable status |
| Body | `partner_name` | Supplier or manufacturer name |
| Body | `changed_by_name` | User who changed status |
| Button (URL, index 0) | dynamic URL suffix | Numeric purchase order `id` |

---

### 3.10 Inventory updated — `mgr_inventory_updated_guj`

**When:** `POST /inventory/adjust`, product stock edit, or variant stock edit.

**Recipients:** All active **Super Admin** users only (role name `Super Admin`, staff account with mobile on file).

| Component | Parameter name (Meta) | Value sent by API |
|-----------|-------------------------|-------------------|
| Body | `recipient_name` | User receiving the message |
| Body | `updated_by_name` | User who updated stock |
| Body | `branch_name` | Branch name |
| Body | `inventory_detail` | `{sku} \| {product} \| {variant?} \| Qty: {n}` |
| Body | `adjustment_type` | `Stock In` / `Stock Out` / `Stock Adjustment` |
| Body | `new_stock_qty` | Stock quantity after update |
| Body | `notes_preview` | Notes or `—` |

**Button:** If the approved template includes a **Visit website** button, it must be a **static** URL in Meta (no `{{1}}` suffix). The API sends **body parameters only** — do not add button components unless your template uses a dynamic URL variable.

---

## 4. Who receives messages

- **Included:** Users linked on the order as assignees (`order_assignees`), or legacy single `assignedTo` if no junction rows exist.
- **Not included by default:** Order creator (unless they are also an assignee), delivery assignees, customers.

Each assignee must have:

1. **Active** user account (`isActive: true`)
2. **Mobile** stored on the user profile (10-digit India numbers are normalized to `91XXXXXXXXXX`)

### Purchase orders

| Event | Recipients |
|-------|------------|
| PO created | Supplier/manufacturer portal users + PO creator |
| PO updated | PO creator only |
| PO status changed | Supplier/manufacturer portal users + PO creator |

Partner users are ERP users linked to the supplier or manufacturer (`User.supplierId` / `User.manufacturerId`). The creator is stored on `purchase_orders.created_by_id` (set when the PO is created).

### Inventory

| Event | Recipients |
|-------|------------|
| Stock updated | User who updated + all **Super Admin** users |

Super Admin is determined by role name `Super Admin` (`isSuperAdminRole` in the API).

Phone normalization lives in [`backend/api-server/src/lib/whatsapp-phone.ts`](backend/api-server/src/lib/whatsapp-phone.ts).

---

## 5. Meta Business setup checklist

1. **WhatsApp Business Account** connected to your Meta app.
2. **Phone number** added and linked; note the **Phone number ID** → `WHATSAPP_PHONE_NUMBER_ID`.
3. **Access token** with `whatsapp_business_messaging` (and related) permissions → `WHATSAPP_ACCESS_TOKEN`.
4. **Message templates** created and **Approved** with:
   - Exact **template name** (or override via `WHATSAPP_TEMPLATE_*`)
   - Matching **language code** (or override via `*_LANG`)
   - Same **body parameter names** as in section 3
   - **URL button** on index `0` if your templates use a dynamic link (API sends order id as button text)
5. **Test numbers** added in Meta developer mode if the business account is not live.

Graph endpoint used:

```http
POST https://graph.facebook.com/{WHATSAPP_API_VERSION}/{WHATSAPP_PHONE_NUMBER_ID}/messages
Authorization: Bearer {WHATSAPP_ACCESS_TOKEN}
```

---

## 6. Changing template names in Meta

If you create **new** templates in Meta (e.g. `mgr_order_created_v2`):

1. Keep the same **parameter names** (`name`, `order_id`, `job_status`, etc.) unless you also change [`whatsapp-templates.ts`](backend/api-server/src/lib/whatsapp-templates.ts).
2. Set the env override, for example:

   ```env
   WHATSAPP_TEMPLATE_ORDER_CREATED=mgr_order_created_v2
   WHATSAPP_TEMPLATE_ORDER_CREATED_LANG=en
   ```

3. Restart the API server.

You do **not** need to change frontend code for template renames—only backend `.env` (or defaults in `whatsapp-templates.ts` if you want new global defaults).

---

## 7. Troubleshooting

| Symptom | What to check |
|---------|----------------|
| No messages at all | `WHATSAPP_ENABLED=true`, token and phone number ID set, API restarted |
| Log: `WhatsApp disabled or not configured` | Missing token or phone number ID |
| Meta error `template name does not exist` | Template name / language mismatch → use `WHATSAPP_TEMPLATE_*` overrides |
| Meta error on parameters | Parameter **names** or **count** don’t match approved template |
| Assignee never gets message | User not in assignees; mobile empty or invalid; user inactive |
| Status update works, edit doesn’t | `ORDER_UPDATED` only fires on non-status field changes |
| Token in frontend `.env` | Remove it; use **backend** `.env` only |

Server logs use namespace `whatsapp` (search for `WhatsApp template sent` or warning lines with Meta error details).

---

## 8. Security

- **Never** put `WHATSAPP_ACCESS_TOKEN` in `frontend/furniture-erp/.env` or commit it to git.
- Add `backend/api-server/.env` to `.gitignore` if it isn’t already.
- Rotate tokens in Meta if a token was exposed in the frontend or in chat.

---

## 9. Quick reference — all `WHATSAPP_*` variables

```text
WHATSAPP_ENABLED
WHATSAPP_PHONE_NUMBER_ID
WHATSAPP_ACCESS_TOKEN
WHATSAPP_API_VERSION

WHATSAPP_TEMPLATE_ORDER_CREATED
WHATSAPP_TEMPLATE_ORDER_CREATED_LANG
WHATSAPP_TEMPLATE_ORDER_STATUS
WHATSAPP_TEMPLATE_ORDER_STATUS_LANG
WHATSAPP_TEMPLATE_ORDER_UPDATED
WHATSAPP_TEMPLATE_ORDER_UPDATED_LANG
WHATSAPP_TEMPLATE_PAYMENT_RECEIVED
WHATSAPP_TEMPLATE_PAYMENT_RECEIVED_LANG
WHATSAPP_TEMPLATE_ORDER_PAYMENT_STATUS_CHANGED
WHATSAPP_TEMPLATE_ORDER_PAYMENT_STATUS_CHANGED_LANG
WHATSAPP_TEMPLATE_DELIVERY_UPDATED
WHATSAPP_TEMPLATE_DELIVERY_UPDATED_LANG
WHATSAPP_TEMPLATE_ORDER_COMMENT
WHATSAPP_TEMPLATE_ORDER_COMMENT_LANG
WHATSAPP_TEMPLATE_PO_CREATED
WHATSAPP_TEMPLATE_PO_CREATED_LANG
WHATSAPP_TEMPLATE_PO_UPDATED
WHATSAPP_TEMPLATE_PO_UPDATED_LANG
WHATSAPP_TEMPLATE_PO_STATUS
WHATSAPP_TEMPLATE_PO_STATUS_LANG
WHATSAPP_TEMPLATE_INVENTORY_UPDATED
WHATSAPP_TEMPLATE_INVENTORY_UPDATED_LANG
```

---

## 10. Template text suggestions (copy into Meta)

Use these when creating templates in **WhatsApp Manager → Message templates**. Variable names must match **exactly** — the API sends them as named parameters.

| Variable | Meaning |
|----------|---------|
| `recipient_name` | Assignee who receives the WhatsApp (each assignee gets their own name) |
| `created_by_name` | Who created the order |
| `updated_by_name` | Who edited the order |
| `changed_by_name` | Who changed the status |
| `branch_name` | Order branch |
| `order_id` | Order summary line |
| `job_status` | New status (status template only) |

> **Important:** Re-submit templates in Meta with these variable names. The API sends **one message per assignee** so `recipient_name` is personalized (e.g. "Hi Rajesh" vs "Hi Amit").

**URL button:** Set base URL to your ERP order page, e.g. `https://your-domain.com/orders/` — Meta appends the dynamic part (order id) from the API.

**Sample values** (for preview only):

| Variable | Example value |
|----------|----------------|
| `recipient_name` | Amit Shah *(assignee getting the message)* |
| `created_by_name` | Rajesh Patel |
| `updated_by_name` | Rajesh Patel |
| `changed_by_name` | Rajesh Patel |
| `branch_name` | Ahmedabad Showroom |
| `order_id` (create) | `ORD-20260522-abc \| Amit Shah \| ₹45,000` |
| `order_id` (status) | `ORD-20260522-abc (#42)` |
| `order_id` (update) | `ORD-20260522-abc \| Amit Shah` |
| `job_status` | Manufacturing |
| Button suffix | `42` |

---

### 10.1 Order created

**Template name (suggested):** `mgr_carsa_order_managment` or `mgr_order_created_en`  
**Category:** Utility  
**Language:** English (US) — `en_US`

**Body text (English):**
 
```text
Hello {{recipient_name}},

A new order has been assigned to you.

Created by: {{created_by_name}}
Branch: {{branch_name}}

Order details:
{{order_id}}

Please open the order in MGR CASA to review items and delivery.

Thank you,
MGR CASA Team
```

**Body text (Gujarati) — template name e.g. `mgr_order_created_guj`, language `gu`:**

```text
નમસ્તે {{recipient_name}},

તમને નવો ઓર્ડર સોંપવામાં આવ્યો છે.

બનાવનાર: {{created_by_name}}
શાખા: {{branch_name}}

ઓર્ડર વિગત:
{{order_id}}

કૃપા કરીને MGR CASA માં ઓર્ડર ખોલી વસ્તુઓ અને ડિલિવરી તપાસો.

આભાર,
MGR CASA
```

**Button:** Call to action → Visit website → URL type **Dynamic**  
- Base: `https://your-domain.com/orders/`  
- Suffix variable: `{{1}}` in Meta UI (maps to order id from API)

**Preview (English, filled in):**

```text
Hello Amit Shah,

A new order has been assigned to you.

Created by: Rajesh Patel
Branch: Ahmedabad Showroom

Order details:
ORD-20260522-abc | Customer Name | ₹45000

Please open the order in MGR CASA to review items and delivery.

Thank you,
MGR CASA Team

[View order]
```

---

### 10.2 Order status changed

**Template name (suggested):** `mgr_job_status_guj` or `mgr_order_status_en`  
**Category:** Utility  
**Language:** English — `en` (or Gujarati `gu` for Gujarati body below)

**Body text (English):**

```text
Hello {{recipient_name}},

Order update — {{order_id}}

Branch: {{branch_name}}

Status changed to: *{{job_status}}*

Changed by: {{changed_by_name}}

Open the order for full details.
```

**Body text (Gujarati) — language `gu`:**

```text
નમસ્તે {{recipient_name}},

ઓર્ડર અપડેટ — {{order_id}}

શાખા: {{branch_name}}

સ્થિતિ બદલાઈ: *{{job_status}}*

બદલાવ કરનાર: {{changed_by_name}}

સંપૂર્ણ વિગત માટે ઓર્ડર ખોલો.
```


ઓર્ડર જુઓ

http://89.116.33.9:5173/orders/{{}}
http://89.116.33.9:5173/orders/11



**Button:** Visit website (dynamic) → `https://your-domain.com/orders/` + id suffix

**Preview (English, filled in):**

```text
Hello Amit Shah,

Order update — ORD-20260522-abc (#42)

Branch: Ahmedabad Showroom

Status changed to: *Manufacturing*

Changed by: Rajesh Patel

Open the order for full details.

[View order]
```

**Status values the API may send** (humanized from ERP):

| ERP status | Text in message |
|------------|-----------------|
| `order_received` | Order Received |
| `manufacturing` | Manufacturing |
| `ready_to_ship` | Ready To Ship |
| `complete` | Complete |
| `cancelled` | Cancelled |

---

### 10.3 Order updated (details edited)

**Template name (suggested):** `mgr_order_updated_guj` or `mgr_order_updated_en`  
**Category:** Utility  
**Language:** English — `en`

**Body text (English):**

```text
Hello {{recipient_name}},

Order {{order_id}} was updated.

Branch: {{branch_name}}

Updated by: {{updated_by_name}}

Customer, items, amount, or assignees may have changed. Please review the order.
```

**Body text (Gujarati) — language `gu`:**

```text

નમસ્તે {{recipient_name}},

ઓર્ડર {{order_id}} અપડેટ થયો.

શાખા: {{branch_name}}

અપડેટ કરનાર: {{updated_by_name}}

ગ્રાહક, વસ્તુઓ, રકમ અથવા સોંપણી બદલાઈ હોઈ શકે. કૃપા કરીને ઓર્ડર તપાસો.
```

**Button:** Visit website (dynamic) → `https://your-domain.com/orders/` + id suffix

**Preview (English, filled in):**

```text
Hello Amit Shah,

Order ORD-20260522-abc | Customer Name was updated.

Branch: Ahmedabad Showroom

Updated by: Rajesh Patel

Customer, items, amount, or assignees may have changed. Please review the order.

[View order]
```

---

### 10.4 Payment received — `mgr_payment_status_guj`

**Template name (suggested):** `mgr_payment_status_guj`  
**Category:** Utility  
**Language:** Gujarati — `gu` (or `guj` if that is what your Meta account uses)

**Body text (English):**

```text
Hello {{recipient_name}},

Payment update for order:
{{order_id}}

Branch: {{branch_name}}
Payment status: {{payment_status}}
Recorded by: {{recorded_by_name}}

Thank you,
MGR CASA Team
```

**Body text (Gujarati) — header + body:**

```text
*ચૂકવણી અપડેટ | MGR CASA*

નમસ્તે {{recipient_name}},

ઓર્ડર માટે ચૂકવણી અપડેટ:
{{order_id}}

શાખા: {{branch_name}}
ચૂકવણી સ્થિતિ: {{payment_status}}
નોંધ કરનાર: {{recorded_by_name}}

આભાર,
MGR CASA
```

**Preview (English, filled in):**

```text
Hello Amit Shah,

Payment update for order:
ORD-20260522-abc | ₹5000 received

Branch: Ahmedabad Showroom
Payment status: Partially Paid
Recorded by: Rajesh Patel
```

**Preview (Gujarati, filled in):**

```text
*ચૂકવણી અપડેટ | MGR CASA*

નમસ્તે Amit Shah,

ઓર્ડર માટે ચૂકવણી અપડેટ:
ORD-20260522-abc | ₹5000 received

શાખા: Ahmedabad Showroom
ચૂકવણી સ્થિતિ: Partially Paid
નોંધ કરનાર: Rajesh Patel

આભાર,
MGR CASA
```

---

### 10.4b Order payment status changed — `mgr_order_payment_status_guj`

**Template name (submit in Meta):** `mgr_order_payment_status_guj`  
**Category:** Utility  
**Language:** Gujarati — `gu`

**Body variables (names must match exactly):** `recipient_name`, `order_id`, `branch_name`, `previous_status`, `new_status`, `changed_by_name`

**Body text (English):**

```text
*Order payment status | MGR CASA*

Hello {{recipient_name}},

Payment status was updated for order {{order_id}}.

Branch: {{branch_name}}
Previous: {{previous_status}}
New status: {{new_status}}
Changed by: {{changed_by_name}}

Tap below to open the order.
```

**Body text (Gujarati) — copy into Meta:**

```text
*ઓર્ડર ચૂકવણી સ્થિતિ | MGR CASA*

નમસ્તે {{recipient_name}},

ઓર્ડર {{order_id}} ની ચૂકવણી સ્થિતિ બદલાઈ.

શાખા: {{branch_name}}
પહેલાં: {{previous_status}}
નવી સ્થિતિ: {{new_status}}
બદલાવ કરનાર: {{changed_by_name}}

ઓર્ડર તપાસવા નીચે ટેપ કરો.
```

**Button:** Visit website — dynamic URL  
**Base URL:** `https://your-domain.com/orders/`  
**Suffix variable:** `{{1}}` = numeric order id (API sends this automatically)

If Meta only allows a **static** button URL, create the template without `{{1}}` and tell dev to remove the button component in code (same as inventory template).

**Preview (English, filled in):**

```text
*Order payment status | MGR CASA*

Hello Amit Shah,

Payment status was updated for order ORD-20260522-abc (#42).

Branch: Ahmedabad Showroom
Previous: Due
New status: Partially Paid
Changed by: Rajesh Patel

Tap below to open the order.
```

**Preview (Gujarati, filled in):**

```text
*ઓર્ડર ચૂકવણી સ્થિતિ | MGR CASA*

નમસ્તે Amit Shah,

ઓર્ડર ORD-20260522-abc (#42) ની ચૂકવણી સ્થિતિ બદલાઈ.

શાખા: Ahmedabad Showroom
પહેલાં: Due
નવી સ્થિતિ: Partially Paid
બદલાવ કરનાર: Rajesh Patel

ઓર્ડર તપાસવા નીચે ટેપ કરો.
```

**After approval — add to `backend/api-server/.env`:**

```env
WHATSAPP_TEMPLATE_ORDER_PAYMENT_STATUS_CHANGED=mgr_order_payment_status_guj
WHATSAPP_TEMPLATE_ORDER_PAYMENT_STATUS_CHANGED_LANG=gu
```

---

### 10.5 Delivery status — `mgr_delivery_status_guj`

**Template name (suggested):** `mgr_delivery_status_guj` or `mgr_delivery_status_en`  
**Category:** Utility  
**Language:** Gujarati — `gu`

**Body text (English):**

```text
Hello {{recipient_name}},

Delivery update — {{order_id}}

Branch: {{branch_name}}
Status: {{delivery_status}}
Driver: {{driver_name}}
Updated by: {{changed_by_name}}

Open the order for details.
```

**Body text (Gujarati) — header + body:**

```text
*ડિલિવરી અપડેટ | MGR CASA*

નમસ્તે {{recipient_name}},

ડિલિવરી અપડેટ — {{order_id}}

શાખા: {{branch_name}}
સ્થિતિ: {{delivery_status}}
ડ્રાઇવર: {{driver_name}}
અપડેટ કરનાર: {{changed_by_name}}

વિગત માટે ઓર્ડર ખોલો.
```

**Preview (English, filled in):**

```text
Hello Amit Shah,

Delivery update — ORD-20260522-abc (#42)

Branch: Ahmedabad Showroom
Status: Out for delivery
Driver: Ramesh Kumar
Updated by: Rajesh Patel
```

**Preview (Gujarati, filled in):**

```text
*ડિલિવરી અપડેટ | MGR CASA*

નમસ્તે Amit Shah,

ડિલિવરી અપડેટ — ORD-20260522-abc (#42)

શાખા: Ahmedabad Showroom
સ્થિતિ: Out for delivery
ડ્રાઇવર: Ramesh Kumar
અપડેટ કરનાર: Rajesh Patel

વિગત માટે ઓર્ડર ખોલો.
```

---

### 10.6 Staff comment — `mgr_order_comment_guj`

**Template name (suggested):** `mgr_order_comment_guj` or `mgr_order_comment_en`  
**Category:** Utility  
**Language:** Gujarati — `gu`

**Body text (English):**

```text
Hello {{recipient_name}},

New comment on order {{order_id}}

Branch: {{branch_name}}
By: {{comment_by_name}}

{{comment_preview}}

Open the order to reply.
```

**Body text (Gujarati) — header + body:**

```text
*નવી ટિપ્પણી | MGR CASA*

નમસ્તે {{recipient_name}},

ઓર્ડર {{order_id}} પર નવી ટિપ્પણી

શાખા: {{branch_name}}
ટિપ્પણી કરનાર: {{comment_by_name}}

{{comment_preview}}

જવાબ આપવા ઓર્ડર ખોલો.
```

**Preview (English, filled in):**

```text
Hello Amit Shah,

New comment on order ORD-20260522-abc (#42)

Branch: Ahmedabad Showroom
By: Rajesh Patel

Please confirm delivery date with customer.

Open the order to reply.
```

**Preview (Gujarati, filled in):**

```text
*નવી ટિપ્પણી | MGR CASA*

નમસ્તે Amit Shah,

ઓર્ડર ORD-20260522-abc (#42) પર નવી ટિપ્પણી

શાખા: Ahmedabad Showroom
ટિપ્પણી કરનાર: Rajesh Patel

Please confirm delivery date with customer.

જવાબ આપવા ઓર્ડર ખોલો.
```

---

### 10.7 Shorter templates (if Meta limits length)

**Created (minimal) — English:**

```text
Hi {{recipient_name}}, new order at {{branch_name}} by {{created_by_name}}: {{order_id}}. Tap below.
```

**Created (minimal) — Gujarati:**

```text
*નવો ઓર્ડર | MGR CASA* — નમસ્તે {{recipient_name}}, {{branch_name}} — {{created_by_name}} દ્વારા: {{order_id}}. નીચે ટેપ કરો.
```

**Status (minimal) — English:**

```text
Hi {{recipient_name}}, {{branch_name}} — {{order_id}} → {{job_status}} by {{changed_by_name}}.
```

**Status (minimal) — Gujarati:**

```text
*સ્થિતિ અપડેટ | MGR CASA* — નમસ્તે {{recipient_name}}, {{branch_name}} — {{order_id}} → {{job_status}} ({{changed_by_name}}).
```

**Updated (minimal) — English:**

```text
Hi {{recipient_name}}, {{branch_name}} — {{order_id}} updated by {{updated_by_name}}.
```

**Updated (minimal) — Gujarati:**

```text
*ઓર્ડર અપડેટ | MGR CASA* — નમસ્તે {{recipient_name}}, {{branch_name}} — {{order_id}} અપડેટ: {{updated_by_name}}.
```

**Payment (minimal) — English:**

```text
Hi {{recipient_name}}, {{order_id}} at {{branch_name}} — {{payment_status}}. Recorded by {{recorded_by_name}}.
```

**Payment (minimal) — Gujarati:**

```text
*ચૂકવણી | MGR CASA* — નમસ્તે {{recipient_name}}, {{order_id}} ({{branch_name}}) — {{payment_status}}. નોંધ: {{recorded_by_name}}.
```

**Order payment status changed (minimal) — English:**

```text
Hi {{recipient_name}}, {{order_id}} at {{branch_name}}: {{previous_status}} → {{new_status}} by {{changed_by_name}}.
```

**Order payment status changed (minimal) — Gujarati:**

```text
*ચૂકવણી સ્થિતિ | MGR CASA* — નમસ્તે {{recipient_name}}, {{order_id}} ({{branch_name}}): {{previous_status}} → {{new_status}}. {{changed_by_name}}.
```

**Delivery (minimal) — English:**

```text
Hi {{recipient_name}}, {{order_id}} — {{delivery_status}}. Driver: {{driver_name}}. By {{changed_by_name}}.
```

**Delivery (minimal) — Gujarati:**

```text
*ડિલિવરી | MGR CASA* — નમસ્તે {{recipient_name}}, {{order_id}} — {{delivery_status}}. ડ્રાઇવર: {{driver_name}}. {{changed_by_name}}.
```

**Comment (minimal) — English:**

```text
Hi {{recipient_name}}, comment on {{order_id}} by {{comment_by_name}}: {{comment_preview}}
```

**Comment (minimal) — Gujarati:**

```text
*ટિપ્પણી | MGR CASA* — નમસ્તે {{recipient_name}}, {{order_id}} — {{comment_by_name}}: {{comment_preview}}
```

---

### 10.8 Purchase order templates (Gujarati)

#### PO created — `mgr_po_created_guj`

```text
*નવો ખરીદી ઓર્ડર | MGR CASA*

નમસ્તે {{recipient_name}},

તમારા માટે નવો ખરીદી ઓર્ડર બનાવવામાં આવ્યો છે.

બનાવનાર: {{created_by_name}}
શાખા: {{branch_name}}
પાર્ટનર: {{partner_name}}

વિગત:
{{po_id}}

કૃપા કરીને MGR CASA માં PO ખોલી તપાસો.

આભાર,
MGR CASA
```

#### PO updated — `mgr_po_updated_guj`

```text
*ખરીદી ઓર્ડર અપડેટ | MGR CASA*

નમસ્તે {{recipient_name}},

તમે બનાવેલ PO અપડેટ થયો:
{{po_id}}

શાખા: {{branch_name}}
પાર્ટનર: {{partner_name}}
અપડેટ કરનાર: {{updated_by_name}}

કૃપા કરીને PO ખોલી તપાસો.
```

#### PO status — `mgr_po_status_guj`

```text
*PO સ્થિતિ અપડેટ | MGR CASA*

નમસ્તે {{recipient_name}},

PO અપડેટ — {{po_id}}

શાખા: {{branch_name}}
પાર્ટનર: {{partner_name}}
નવી સ્થિતિ: *{{po_status}}*
બદલાવ કરનાર: {{changed_by_name}}

વિગત માટે PO ખોલો.
```

#### Inventory updated — `mgr_inventory_updated_guj`

```text
*ઇન્વેન્ટરી અપડેટ | MGR CASA*

નમસ્તે {{recipient_name}},

સ્ટોક અપડેટ થયો.

અપડેટ કરનાર: {{updated_by_name}}
શાખા: {{branch_name}}

વિગત:
{{inventory_detail}}

પ્રકાર: {{adjustment_type}}
નવો સ્ટોક: {{new_stock_qty}}

નોંધ: {{notes_preview}}

ઉત્પાદન તપાસવા નીચે ટેપ કરો.
```

---

### 10.9 Meta submission checklist

1. Choose **Utility** (not Marketing) for staff notifications.
2. Add variables per template (see sections 3.1–3.9): **`recipient_name`**, **`branch_name`**, **`order_id`** / **`po_id`**, plus event-specific names.
3. Do not change variable names after approval without updating the API.
4. Approve template → copy exact **template name** and **language code** into `.env` (`WHATSAPP_TEMPLATE_*`).
5. Test with one assignee phone number in Meta’s test mode before going live.
