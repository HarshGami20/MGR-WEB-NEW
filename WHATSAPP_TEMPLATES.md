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
| Delivery status changed | `ORDER_DELIVERY_UPDATED` | `mgr_delivery_status_en` | `en` |
| Staff comment added | `ORDER_STAFF_COMMENT_ADDED` | `mgr_order_comment_en` | `en` |

Sending runs on the **backend only** (never from the browser). Implementation:

| File | Role |
|------|------|
| [`backend/api-server/src/listeners/whatsapp-listeners.ts`](backend/api-server/src/listeners/whatsapp-listeners.ts) | Subscribes to order events and triggers sends |
| [`backend/api-server/src/services/whatsapp-service.ts`](backend/api-server/src/services/whatsapp-service.ts) | Calls Meta Graph API `/{phone-number-id}/messages` |
| [`backend/api-server/src/lib/whatsapp-templates.ts`](backend/api-server/src/lib/whatsapp-templates.ts) | Builds template name, language, and parameters |
| [`backend/api-server/src/lib/whatsapp-order-recipients.ts`](backend/api-server/src/lib/whatsapp-order-recipients.ts) | Resolves assignee phone numbers |
| [`backend/api-server/src/routes/orders.ts`](backend/api-server/src/routes/orders.ts) | Emits order / delivery / comment events |
| [`backend/api-server/src/routes/payments.ts`](backend/api-server/src/routes/payments.ts) | Emits `PAYMENT_RECEIVED` |

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
| `WHATSAPP_TEMPLATE_DELIVERY_UPDATED` | Delivery status | `mgr_delivery_status_en` |
| `WHATSAPP_TEMPLATE_DELIVERY_UPDATED_LANG` | Delivery template language | `en` |
| `WHATSAPP_TEMPLATE_ORDER_COMMENT` | Staff comment | `mgr_order_comment_en` |
| `WHATSAPP_TEMPLATE_ORDER_COMMENT_LANG` | Comment template language | `en` |

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

## 4. Who receives messages

- **Included:** Users linked on the order as assignees (`order_assignees`), or legacy single `assignedTo` if no junction rows exist.
- **Not included by default:** Order creator (unless they are also an assignee), delivery assignees, customers.

Each assignee must have:

1. **Active** user account (`isActive: true`)
2. **Mobile** stored on the user profile (10-digit India numbers are normalized to `91XXXXXXXXXX`)

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
WHATSAPP_TEMPLATE_DELIVERY_UPDATED
WHATSAPP_TEMPLATE_DELIVERY_UPDATED_LANG
WHATSAPP_TEMPLATE_ORDER_COMMENT
WHATSAPP_TEMPLATE_ORDER_COMMENT_LANG
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

**Preview:**

```text
Hello Amit Shah,

Payment update for order:
ORD-20260522-abc | ₹5000 received

Branch: Ahmedabad Showroom
Payment status: Partially Paid
Recorded by: Rajesh Patel
```

---

### 10.5 Delivery status — `mgr_delivery_status_en`

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

**Preview:**

```text
Hello Amit Shah,

Delivery update — ORD-20260522-abc (#42)

Branch: Ahmedabad Showroom
Status: Out for delivery
Driver: Ramesh Kumar
Updated by: Rajesh Patel
```

---

### 10.6 Staff comment — `mgr_order_comment_en`

**Body text (English):**

```text
Hello {{recipient_name}},

New comment on order {{order_id}}

Branch: {{branch_name}}
By: {{comment_by_name}}

{{comment_preview}}

Open the order to reply.
```

**Preview:**

```text
Hello Amit Shah,

New comment on order ORD-20260522-abc (#42)

Branch: Ahmedabad Showroom
By: Rajesh Patel

Please confirm delivery date with customer.

Open the order to reply.
```

---

### 10.7 Shorter templates (if Meta limits length)

**Created (minimal):**

```text
Hi {{recipient_name}}, new order at {{branch_name}} by {{created_by_name}}: {{order_id}}. Tap below.
```

**Status (minimal):**

```text
Hi {{recipient_name}}, {{branch_name}} — {{order_id}} → {{job_status}} by {{changed_by_name}}.
```

**Updated (minimal):**

```text
Hi {{recipient_name}}, {{branch_name}} — {{order_id}} updated by {{updated_by_name}}.
```

**Payment (minimal):**

```text
Hi {{recipient_name}}, {{order_id}} at {{branch_name}} — {{payment_status}}. Recorded by {{recorded_by_name}}.
```

**Delivery (minimal):**

```text
Hi {{recipient_name}}, {{order_id}} — {{delivery_status}}. Driver: {{driver_name}}. By {{changed_by_name}}.
```

**Comment (minimal):**

```text
Hi {{recipient_name}}, comment on {{order_id}} by {{comment_by_name}}: {{comment_preview}}
```

---

### 10.8 Meta submission checklist

1. Choose **Utility** (not Marketing) for staff notifications.
2. Add variables per template (see sections 3.1–3.6): **`recipient_name`**, **`branch_name`**, **`order_id`**, plus event-specific names (`created_by_name`, `payment_status`, `driver_name`, `comment_preview`, etc.).
3. Do not change variable names after approval without updating the API.
4. Approve template → copy exact **template name** and **language code** into `.env` (`WHATSAPP_TEMPLATE_*`).
5. Test with one assignee phone number in Meta’s test mode before going live.
