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

export const nextjsBetterAuthOther = `
// app/api/autumn/[...all]/route.ts

import { autumnHandler } from "autumn-js/next";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export const { GET, POST } = autumnHandler({
  identify: async () => {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    // From the request, retrieve the ID you want to use as the customer ID
    const customerId = "customer_id";

    return {
      customerId,
      customerData: {
        name: session?.user.name,
        email: session?.user.email,
      },
    };
  },
});
`;
