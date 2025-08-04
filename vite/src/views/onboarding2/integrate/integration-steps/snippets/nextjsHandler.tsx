export const nextjsBetterAuthUser = `
// app/api/autumn/[...all]/route.ts

import { autumnHandler } from "autumn-js/next";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export const { GET, POST } = autumnHandler({
  identify: async () => {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    return {
      customerId: session?.user.id,
      customerData: {
        name: session?.user.name,
        email: session?.user.email,
      },
    };
  },
});
`;

export const nextjsBetterAuthOrg = `
// app/api/autumn/[...all]/route.ts

import { autumnHandler } from "autumn-js/next";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export const { GET, POST } = autumnHandler({
  identify: async () => {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    return {
      customerId: session?.session.activeOrganizationId,
      customerData: {
        name: session?.user.name,
        email: session?.user.email,
      },
    };
  },
});
`;

// Supabase Auth
export const nextjsSupabaseUser = `
// app/api/autumn/[...all]/route.ts

import { autumnHandler } from "autumn-js/next";
import { createClient } from "@/utils/supabase/server";

export const { GET, POST } = autumnHandler({
  identify: async () => {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();

    if (error || !data?.user) {
      return null;
    }

    return {
      customerId: data.user.id,
      customerData: {
        name: data.user.user_metadata?.name,
        email: data.user.email,
      },
    };
  },
});`;

export const nextjsSupabaseOrg = `
// app/api/autumn/[...all]/route.ts

import { autumnHandler } from "autumn-js/next";
import { createClient } from "@/utils/supabase/server";

export const { GET, POST } = autumnHandler({
  identify: async () => {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();

    if (error || !data?.user) {
      return null;
    }

    // Get the orgId of the user from your DB
    const customerId = "users_org_id";

    return {
      customerId,
      customerData: {
        name: data.user.user_metadata?.name,
        email: data.user.email,
      },
    };
  },
});
`;

export const nextjsClerkUser = `
// app/api/autumn/[...all]/route.ts

import { autumnHandler } from "autumn-js/next";
import { auth } from "@clerk/nextjs/server";

export const { GET, POST } = autumnHandler({
  identify: async () => {
    const { userId } = await auth();

    if (!userId) return null;

    return {
      customerId: userId,
      // To store the customer name and email
      customerData: { name: "", email: "" },
    };
  },
});
`;

export const nextjsClerkOrg = `
// app/api/autumn/[...all]/route.ts

import { autumnHandler } from "autumn-js/next";
import { auth } from "@clerk/nextjs/server";

export const { GET, POST } = autumnHandler({
  identify: async () => {
    const { userId, orgId } = await auth();

    if (!userId || !orgId) return null;

    return {
      customerId: orgId,
      // To store the customer name and email
      customerData: { name: "", email: "" },
    };
  },
});
`;

export const nextjsOther = `
// app/api/autumn/[...all]/route.ts

import { autumnHandler } from "autumn-js/next";

export const { GET, POST } = autumnHandler({
  identify: async (request) => {
  // Authenticate the request and get the customer ID
    const customerId = "customer_id"; 
    return {
      customerId,
      customerData: { name: "", email: "" },
    };
  },
});
`;
