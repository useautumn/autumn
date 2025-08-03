import { betterAuthSnippet } from "./betterAuth";
import { supabaseAuthSnippet } from "./supabaseAuth";

export const rr7BetterAuth = (customerType: "user" | "org") => {
  return `// app/routes/api.autumn.tsx

import { autumnHandler } from "autumn-js/react-router";
import { auth } from "@/lib/auth";

const handler = autumnHandler({
  secretKey: process.env.AUTUMN_SECRET_KEY!,
  identify: async (args) => {
${betterAuthSnippet(customerType, "args.request.headers", 2)}
  },
});

export const loader = handler.loader;
export const action = handler.action;`;
};
export const rr7Supabase = (customerType: "user" | "org") => {
  return `// app/routes/api.autumn.tsx

import { autumnHandler } from "autumn-js/react-router";
import { createClient } from "@/utils/supabase/server";

const handler = autumnHandler({
  secretKey: process.env.AUTUMN_SECRET_KEY!,
  identify: async (args) => {
    ${supabaseAuthSnippet({ customerType })}
  },
});

export const loader = handler.loader;
export const action = handler.action;`;
};

export const clerkSnippet = (customerType: "user" | "org") => {
  if (customerType === "user") {
    return `const { userId } = await getAuth(args);

    if (!userId) return null;

    return {
      customerId: userId,
      customerData: { name: "", email: "" },
    };`;
  }

  return `const { userId, orgId } = await getAuth(args);

    if (!userId || !orgId) return null;

    return {
      customerId: orgId,
      customerData: { name: "", email: "" },
    };`;
};
export const rr7Clerk = (customerType: "user" | "org") => {
  return `// app/routes/api.autumn.tsx

import { autumnHandler } from "autumn-js/react-router";
import { getAuth } from "@clerk/react-router/ssr.server";

const handler = autumnHandler({
  secretKey: process.env.AUTUMN_SECRET_KEY!,
  identify: async (args) => {
    ${clerkSnippet(customerType)}
  },
});

export const loader = handler.loader;
export const action = handler.action;`;
};
