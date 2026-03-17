export default `---
name: autumn-setup
description: |
  Sets up Autumn billing integration: installs the SDK, creates a customer, and adds the payment flow.
  Use this skill when the user wants to:
  - Set up Autumn billing
  - Create an Autumn customer
  - Integrate Autumn into their app
  - Add billing/entitlements with Autumn
  - Configure Autumn SDK
  - Add payment flow or checkout
---

# Set up Autumn Billing

Autumn is a billing and entitlements layer over Stripe. This skill walks through installing the SDK, creating an Autumn customer, and wiring up the payment flow.

> **Before starting:** Check for an \`autumn.config.ts\` in the project root. If it doesn't exist, run \`npx atmn init\` to log in and generate the file (this saves your API key and syncs your config). Then refer to \`autumn.config.ts\` for your product and feature IDs.

## Step 1: Analyze the Codebase

Before making changes, detect:

- **Language**: TypeScript/JavaScript, Python, or other
- **If TS/JS - Framework**: Next.js, Hono, or other
- **If TS/JS - React frontend?**: Check for React in package.json

Then ask the user:

1. **Should Autumn customers be individual users, or organizations?**
   - **Users (B2C)**: Each user has their own plan and limits
   - **Organizations (B2B)**: Plans and limits are shared across an org

Tell the user what you detected, which path you'll follow, and what you'll be adding Autumn to.

## Step 2: Create a Plan and Confirm

Before writing any integration code, create a short plan summarizing what you'll do and present it to the user. For example:

- Which files you'll create or modify
- Which path you're following (React fullstack vs backend-only)
- Where the handler / provider / customer creation will go
- Where the payment flow will be wired up

Ask the user to **read, edit, and confirm** the plan before proceeding. Do NOT start coding until the user approves.

---

## Path A: React + Node.js (Fullstack TypeScript)

Use this path if there's a React frontend with a Node.js backend.

### A1. Install the SDK

Use the package manager already installed (npm, yarn, pnpm, bun):

\`\`\`bash
npm install autumn-js
\`\`\`

### A2. Mount the Handler (Server-Side)

This creates endpoints at \`/api/autumn/*\` that the React hooks will call. The \`identify\` function should return either the user ID or org ID from your auth provider, depending on how you're using Autumn.

#### Next.js (App Router)

\`\`\`typescript
// app/api/autumn/[...all]/route.ts
import { autumnHandler } from "autumn-js/next";

export const { GET, POST } = autumnHandler({
  identify: async (request) => {
    // Get user/org from your auth provider
    const session = await auth.api.getSession({ headers: request.headers });
    return {
      customerId: session?.user.id, // or session?.org.id for B2B
      customerData: {
        name: session?.user.name,
        email: session?.user.email,
      },
    };
  },
});
\`\`\`

#### Hono

\`\`\`typescript
import { autumnHandler } from "autumn-js/hono";

app.use("/api/autumn/*", autumnHandler({
  identify: async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    return {
      customerId: session?.user.id, // or session?.org.id for B2B
      customerData: { name: session?.user.name, email: session?.user.email },
    };
  },
}));
\`\`\`

#### Other Frameworks (Generic Handler)

For any framework not listed above, use the generic handler:

\`\`\`typescript
import { autumnHandler } from "autumn-js/backend";

// Mount this handler onto the /api/autumn/* path in your backend
const handleRequest = async (request) => {
  const session = await auth.api.getSession({ headers: request.headers });

  let body = null;
  if (request.method !== "GET") {
    body = await request.json();
  }

  const { statusCode, response } = await autumnHandler({
    customerId: session?.user.id,
    customerData: {
      name: session?.user.name,
      email: session?.user.email,
    },
    request: {
      url: request.url,
      method: request.method,
      body: body,
    },
  });

  return new Response(JSON.stringify(response), {
    status: statusCode,
    headers: { "Content-Type": "application/json" },
  });
};
\`\`\`

### A3. Add the Provider (Client-Side)

Wrap your app with \`AutumnProvider\`:

\`\`\`tsx
import { AutumnProvider } from "autumn-js/react";

export default function RootLayout({ children }) {
  return (
    <AutumnProvider>
      {children}
    </AutumnProvider>
  );
}
\`\`\`

If your backend is on a different URL (e.g., Vite + separate server), pass \`backendUrl\`:

\`\`\`tsx
<AutumnProvider backendUrl={import.meta.env.VITE_BACKEND_URL}>
\`\`\`

### A4. Create a Customer

Add this hook to any component. It automatically creates an Autumn customer for new users and fetches existing customer state:

\`\`\`tsx
import { useCustomer } from "autumn-js/react";

const { data } = useCustomer();
console.log("Autumn customer:", data);
\`\`\`

Autumn's customer ID is the same as your internal user or org ID from your auth provider. No need to store any extra IDs.

### A5. Stripe Payment Flow

Call \`attach\` when the customer wants to purchase a plan. This returns a Stripe payment URL. Once they pay, Autumn grants access to the features defined in the plan.

\`\`\`tsx
import { useCustomer } from "autumn-js/react";

export default function PurchaseButton() {
  const { attach } = useCustomer();

  return (
    <button
      onClick={async () => {
        await attach({
          planId: "pro",
          redirectMode: "always",
        });
      }}
    >
      Select Pro Plan
    </button>
  );
}
\`\`\`

This handles all plan change scenarios (upgrades, downgrades, one-time topups, renewals, etc).

The \`redirectMode: "always"\` flag always returns a payment URL:
- New purchases redirect to Stripe Checkout to enter payment details
- Subsequent charges redirect to an Autumn hosted, one-click confirmation page

---

## Path B: Backend Only (Node.js, Python, or Other)

Use this path if there's no React frontend, or you prefer server-side only.

### B1. Install the SDK

**Node.js:**

\`\`\`bash
npm install autumn-js
\`\`\`

**Python:**

\`\`\`bash
pip install autumn-sdk
\`\`\`

### B2. Initialize the Client

**TypeScript/JavaScript:**

\`\`\`typescript
import { Autumn } from "autumn-js";

const autumn = new Autumn({
  secretKey: process.env.AUTUMN_SECRET_KEY,
});
\`\`\`

**Python:**

\`\`\`python
from autumn_sdk import Autumn

autumn = Autumn('am_sk_test_xxx')
\`\`\`

### B3. Create a Customer

When the customer signs up, create an Autumn customer. Autumn will automatically enable any \`autoEnable\` plan (typically Free).

**TypeScript:**

\`\`\`typescript
const customer = await autumn.customers.getOrCreate({
  customerId: "user_or_org_id_from_auth",
  name: "John Doe",
  email: "john@example.com",
});
\`\`\`

**Python:**

\`\`\`python
customer = await autumn.customers.get_or_create(
    customer_id="user_or_org_id_from_auth",
    name="John Doe",
    email="john@example.com",
)
\`\`\`

**cURL:**

\`\`\`bash
curl -X POST https://api.useautumn.com/v1/customers \\
  -H "Authorization: Bearer am_sk_test_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{"customer_id": "user_or_org_id_from_auth", "name": "John Doe", "email": "john@example.com"}'
\`\`\`

Autumn's customer ID is the same as your internal user or org ID from your auth provider. No need to store any extra IDs.

### B4. Stripe Payment Flow

Call \`attach\` when the customer wants to purchase a plan. This returns a Stripe payment URL. Redirect the customer to complete payment.

**TypeScript:**

\`\`\`typescript
const response = await autumn.billing.attach({
  customerId: "user_or_org_id_from_auth",
  planId: "pro",
  redirectMode: "always",
});

redirect(response.paymentUrl);
\`\`\`

**Python:**

\`\`\`python
response = await autumn.billing.attach(
    customer_id="user_or_org_id_from_auth",
    plan_id="pro",
    redirect_mode="always",
)
# Redirect to response.payment_url
\`\`\`

**cURL:**

\`\`\`bash
curl -X POST 'https://api.useautumn.com/v1/attach' \\
  -H 'Authorization: Bearer am_sk_test_xxx' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "customer_id": "user_or_org_id_from_auth",
    "plan_id": "pro",
    "redirect_mode": "always"
  }'
\`\`\`

This handles all plan change scenarios (upgrades, downgrades, one-time topups, renewals, etc).

The \`redirectMode: "always"\` flag always returns a payment URL:
- New purchases redirect to Stripe Checkout to enter payment details
- Subsequent charges redirect to an Autumn hosted, one-click confirmation page

---

## Verification

After setup, report to the user:

1. What stack you detected
2. Which path you followed
3. What files you created/modified
4. That the Autumn customer is logged in browser, and to check in the Autumn dashboard

**Note:** Your Autumn configuration is in \`autumn.config.ts\` in your project root.

**Documentation:** https://docs.useautumn.com/llms.txt
`;
