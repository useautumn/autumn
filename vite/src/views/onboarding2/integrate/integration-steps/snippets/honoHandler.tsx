import { betterAuthSnippet } from "./betterAuth";

export const clerkSnippet = (
  customerType: "user" | "org",
  reqParam: string = "c"
) => {
  if (customerType === "user") {
    return `const auth = getAuth(${reqParam});

      if (!auth?.userId) return null;

      return {
        customerId: auth.userId,
        customerData: { name: "", email: "" },
      };
      `;
  }

  return `const auth = getAuth(${reqParam});

      if (!auth?.userId || !auth?.orgId) return null;

      return {
        customerId: auth.orgId,
        customerData: { name: "", email: "" },
      };
      `;
};

export const honoClerk = (customerType: "user" | "org") => {
  return `import { autumnHandler } from "autumn-js/hono";
import { clerkMiddleware, getAuth } from "@hono/clerk-auth";

app.use("*", clerkMiddleware());
app.use(
  "/api/autumn/*",
  autumnHandler({
    identify: async (c: Context) => {
      ${clerkSnippet(customerType)}
    },
  })
);`;
};

export const supabaseSnippet = (
  customerType: "user" | "org",
  supabaseInit: string = "getSupabase(c)"
) => {
  if (customerType === "user") {
    return `const supabase = ${supabaseInit};

      const { data, error } = await supabase.auth.getUser();

      if (!data?.user?.id) return null;

      return {
        customerId: data.user.id,
        customerData: { name: "", email: "" },
      };`;
  }

  return `const supabase = ${supabaseInit};

      const { data, error } = await supabase.auth.getUser();

      if (!data?.user?.id) return null;

      const orgId = "users_org_id"; // Get the orgId from your DB

      return {
        customerId: orgId,
        customerData: { name: "", email: "" },
      };`;
};

export const honoSupabase = (customerType: "user" | "org") => {
  return `// index.ts
  
import { autumnHandler } from "autumn-js/hono";
import { getSupabase, supabaseMiddleware } from "./middleware/auth.middleware.js";

app.use("*", supabaseMiddleware());
app.use(
  "/api/autumn/*",
  autumnHandler({
    identify: async (c: Context) => {
      ${supabaseSnippet(customerType)}
    },
  })
);`;
};
export const honoBetterAuth = (customerType: "user" | "org") => {
  return `// index.ts

import { autumnHandler } from "autumn-js/hono";
import { auth } from "@/lib/auth"

app.use(
  "/api/autumn/*",
  autumnHandler({
    identify: async (c: Context) => {
${betterAuthSnippet(customerType, "c.req.raw.headers", 3)}
    },
  })
);`;
};
