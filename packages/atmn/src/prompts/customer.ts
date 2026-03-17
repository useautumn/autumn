export const customerPrompt = `## Set up Autumn billing integration

Autumn is a billing and entitlements layer over Stripe, which we are adding into this codebase. Your task is to create an Autumn customer by following these steps, and add it to a place in this app where it will be automatically created.

### Step 1: Analyze my codebase

Before making changes, detect:
- Language (TypeScript/JavaScript, Python, or other)
- If TS/JS: Framework (Next.js, React Router, Tanstack Start, Hono, Express, Fastify, or other)
- If TS/JS: Is there a React frontend? (Check for React in package.json)

Also ask me: 

**1. Should Autumn customers be individual users, or organizations?**
- Users (B2C): Each user has their own plan and limits
- Organizations (B2B): Plans and limits are shared across an org

**2. Have you created an AUTUMN_SECRET_KEY and added it to .env?**
Please prompt them to create one here: https://app.useautumn.com/dev?tab=api_keys and add it to .env as AUTUMN_SECRET_KEY



Tell me what you detected, which path you'll follow and what you'll be adding autumn to.

---

## Path A: React + Node.js (fullstack TypeScript)

Use this path if there's a React frontend with a Node.js backend.

### A1. Install the SDK

**Use the package manager already installed** -- eg user may be using bun, or pnpm.
\`\`\`bash
npm install autumn-js
\`\`\`

### A2. Mount the handler (server-side)

This creates endpoints at \`/api/autumn/*\` that the React hooks will call. The \`identify\` function should return either the user ID or org ID from your auth provider, depending on how you're using Autumn.

**Next.js (App Router):**
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

**React Router:**
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

**Tanstack Start:**
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

**Hono:**
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

**Express:**
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

**Fastify:**
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

**Other frameworks (generic handler):**
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

### A3. Add the provider (client-side)

Wrap your app with AutumnProvider:
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

### A4. Create a test customer

Add this hook to any component to verify the integration:
\`\`\`tsx
import { useCustomer } from "autumn-js/react";

const { customer } = useCustomer();
console.log("Autumn customer:", customer);
\`\`\`

This automatically creates an Autumn customer for new users/orgs.

---

## Path B: Backend only (Node.js, Python, or other)

Use this path if there's no React frontend, or you prefer server-side only.

### B1. Install the SDK
\`\`\`bash
# Node.js
npm install autumn-js

# Python
pip install autumn-py
\`\`\`

### B2. Initialize the client

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

### B3. Create a test customer

This will GET or CREATE a new customer. Add it when a user signs in or loads the app. Pass in ID from auth provider.
The response returns customer state, used to display billing information client-side. Please console.log the Autumn customer client-side.

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

When calling these functions from the client, the SDK exports types for all response objects. Use these for type-safe code.

\`\`\`tsx
import type { Customer } from "autumn-js";
\`\`\`

---

## Verify

After setup, tell me:
1. What stack you detected
2. Which path you followed
3. What files you created/modified
4. That the Autumn customer is logged in browser, and to check in the Autumn dashboard

**Note:** Your Autumn configuration is in \`autumn.config.ts\` in your project root.

Docs: https://docs.useautumn.com/llms.txt`;
