export default `---
name: autumn-creating-customers
description: |
  Sets up Autumn billing integration by creating an Autumn customer in a codebase.
  Use this skill when the user wants to:
  - Set up Autumn billing
  - Create an Autumn customer
  - Integrate Autumn into their app
  - Add billing/entitlements with Autumn
  - Configure Autumn SDK
---

# Set up Autumn Billing Integration

Autumn is a billing and entitlements layer over Stripe. This skill guides you through creating an Autumn customer and adding it to a place in the app where it will be automatically created.

## Step 1: Analyze the Codebase

Before making changes, detect:

- **Language**: TypeScript/JavaScript, Python, or other
- **If TS/JS - Framework**: Next.js, React Router, Tanstack Start, Hono, Express, Fastify, or other
- **If TS/JS - React frontend?**: Check for React in package.json

Then ask the user:

1. **Should Autumn customers be individual users, or organizations?**
   - **Users (B2C)**: Each user has their own plan and limits
   - **Organizations (B2B)**: Plans and limits are shared across an org

2. **Have you created an AUTUMN_SECRET_KEY and added it to .env?**
   - Prompt them to create one at: https://app.useautumn.com/dev?tab=api_keys
   - Add it to \`.env\` as \`AUTUMN_SECRET_KEY\`

Tell the user what you detected, which path you'll follow, and what you'll be adding Autumn to.

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

#### React Router

\`\`\`typescript
// app/routes/api.autumn.tsx
import { autumnHandler } from "autumn-js/react-router";

export const { loader, action } = autumnHandler({
  identify: async (args) => {
    const session = await auth.api.getSession({ headers: args.request.headers });
    return {
      customerId: session?.user.id, // or session?.org.id for B2B
      customerData: { name: session?.user.name, email: session?.user.email },
    };
  },
});

// routes.ts - add this route
route("api/autumn/*", "routes/api.autumn.tsx")
\`\`\`

#### Tanstack Start

\`\`\`typescript
// routes/api/autumn.$.ts
import { autumnHandler } from "autumn-js/tanstack";

const handler = autumnHandler({
  identify: async ({ request }) => {
    const session = await auth.api.getSession({ headers: request.headers });
    return {
      customerId: session?.user.id, // or session?.org.id for B2B
      customerData: { name: session?.user.name, email: session?.user.email },
    };
  },
});

export const Route = createFileRoute("/api/autumn/$")({
  server: { handlers: handler },
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

#### Express

\`\`\`typescript
import { autumnHandler } from "autumn-js/express";

app.use(express.json()); // Must be before autumnHandler
app.use("/api/autumn", autumnHandler({
  identify: async (req) => {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    return {
      customerId: session?.user.id, // or session?.org.id for B2B
      customerData: { name: session?.user.name, email: session?.user.email },
    };
  },
}));
\`\`\`

#### Fastify

\`\`\`typescript
import { autumnHandler } from "autumn-js/fastify";

fastify.route({
  method: ["GET", "POST"],
  url: "/api/autumn/*",
  handler: autumnHandler({
    identify: async (request) => {
      const session = await auth.api.getSession({ headers: request.headers as any });
      return {
        customerId: session?.user.id, // or session?.org.id for B2B
        customerData: { name: session?.user.name, email: session?.user.email },
      };
    },
  }),
});
\`\`\`

#### Other Frameworks (Generic Handler)

\`\`\`typescript
import { autumnHandler } from "autumn-js/backend";

// Mount this handler onto the /api/autumn/* path in your backend
const handleRequest = async (request) => {
  // Your authentication logic here
  const customerId = "user_or_org_id_from_auth";
  
  let body = null;
  if (request.method !== "GET") {
    body = await request.json();
  }
  
  const { statusCode, response } = await autumnHandler({
    customerId,
    customerData: { name: "", email: "" },
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

### A4. Create a Test Customer

Add this hook to any component to verify the integration:

\`\`\`tsx
import { useCustomer } from "autumn-js/react";

const { customer } = useCustomer();
console.log("Autumn customer:", customer);
\`\`\`

This automatically creates an Autumn customer for new users/orgs.

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
pip install autumn-py
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
from autumn import Autumn

autumn = Autumn('am_sk_test_xxx')
\`\`\`

### B3. Create a Test Customer

This will GET or CREATE a new customer. Add it when a user signs in or loads the app. Pass in ID from auth provider.

The response returns customer state, used to display billing information client-side. Log the Autumn customer client-side.

**TypeScript:**

\`\`\`typescript
const { data, error } = await autumn.customers.create({
  id: "user_or_org_id_from_auth",
  name: "Test User",
  email: "test@example.com",
});
\`\`\`

**Python:**

\`\`\`python
customer = await autumn.customers.create(
    id="user_or_org_id_from_auth",
    name="Test User",
    email="test@example.com",
)
\`\`\`

**cURL:**

\`\`\`bash
curl -X POST https://api.useautumn.com/customers \\
  -H "Authorization: Bearer am_sk_test_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{"id": "user_or_org_id_from_auth", "name": "Test User", "email": "test@example.com"}'
\`\`\`

### Type Safety

When calling these functions from the client, the SDK exports types for all response objects:

\`\`\`tsx
import type { Customer } from "autumn-js";
\`\`\`

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
