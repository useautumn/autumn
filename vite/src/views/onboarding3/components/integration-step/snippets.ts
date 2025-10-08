import type { AuthType, CustomerType, StackType } from "./IntegrationContext";

export const getBackendSnippet = (
	stack: StackType,
	auth: AuthType,
	customerType: CustomerType,
	_secretKey: string,
): string => {
	switch (stack) {
		case "nextjs":
			return getNextjsSnippet(auth, customerType);
		case "express":
			return getExpressSnippet(auth, customerType);
		case "hono":
			return getHonoSnippet(auth, customerType);
		case "elysia":
			return getElysiaSnippet(auth, customerType);
		case "rr7":
			return getRR7Snippet(auth, customerType);
		default:
			return getGeneralSnippet();
	}
};

const getNextjsSnippet = (
	auth: AuthType,
	customerType: CustomerType,
): string => {
	switch (auth) {
		case "betterauth":
			return customerType === "user"
				? nextjsBetterAuthUser
				: nextjsBetterAuthOrg;
		case "supabase":
			return customerType === "user" ? nextjsSupabaseUser : nextjsSupabaseOrg;
		case "clerk":
			return customerType === "user" ? nextjsClerkUser : nextjsClerkOrg;
		default:
			return nextjsOther;
	}
};

const getExpressSnippet = (
	_auth: AuthType,
	customerType: CustomerType,
): string => {
	return `// server.js or app.js

import express from "express";
import { autumnHandler } from "autumn-js/backend";

const app = express();
app.use(express.json());

app.use("/api/autumn/*", async (req, res) => {
  // Your authentication logic here
  const customerId = "${customerType === "user" ? "user_id" : "org_id"}";

  const { statusCode, response } = await autumnHandler({
    customerId,
    customerData: { name: "", email: "" },
    request: {
      url: req.url,
      method: req.method,
      body: req.body,
    },
  });

  res.status(statusCode).json(response);
});`;
};

const getHonoSnippet = (
	_auth: AuthType,
	customerType: CustomerType,
): string => {
	return `// app.ts

import { Hono } from "hono";
import { autumnHandler } from "autumn-js/backend";

const app = new Hono();

app.use("/api/autumn/*", async (c) => {
  // Your authentication logic here
  const customerId = "${customerType === "user" ? "user_id" : "org_id"}";

  let body = null;
  if (c.req.method !== "GET") {
    body = await c.req.json();
  }

  const { statusCode, response } = await autumnHandler({
    customerId,
    customerData: { name: "", email: "" },
    request: {
      url: c.req.url,
      method: c.req.method,
      body: body,
    },
  });

  return c.json(response, statusCode);
});`;
};

const getElysiaSnippet = (
	_auth: AuthType,
	customerType: CustomerType,
): string => {
	return `// index.ts

import { Elysia } from "elysia";
import { autumnHandler } from "autumn-js/backend";

new Elysia()
  .all("/api/autumn/*", async ({ request }) => {
    // Your authentication logic here
    const customerId = "${customerType === "user" ? "user_id" : "org_id"}";

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
      headers: { "Content-Type": "application/json" }
    });
  })
  .listen(3000);`;
};

const getRR7Snippet = (_auth: AuthType, customerType: CustomerType): string => {
	return `// app/routes/api.autumn.$.tsx

import { autumnHandler } from "autumn-js/backend";
import type { ActionFunction, LoaderFunction } from "@remix-run/node";

const handler = async (request: Request) => {
  // Your authentication logic here
  const customerId = "${customerType === "user" ? "user_id" : "org_id"}";

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

export const loader: LoaderFunction = ({ request }) => handler(request);
export const action: ActionFunction = ({ request }) => handler(request);`;
};

const getGeneralSnippet = (): string => {
	return `import { autumnHandler } from "autumn-js/backend";

// 1. autumnHandler takes in request properties and returns a response
// 2. Simply mount the handler onto the /api/autumn/* path in your backend
// 3. Call autumnHandler and pass in the required parameters
// 4. Return the response from the autumnHandler

// Example using autumnHandler with your framework
const handleRequest = async (request) => {
  // Your authentication logic here
  const customerId = "user_id_or_org_id";

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
};`;
};

// Next.js specific snippets
const nextjsBetterAuthUser = `// app/api/autumn/[...all]/route.ts

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
});`;

const nextjsBetterAuthOrg = `// app/api/autumn/[...all]/route.ts

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
});`;

const nextjsSupabaseUser = `// app/api/autumn/[...all]/route.ts

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

const nextjsSupabaseOrg = `// app/api/autumn/[...all]/route.ts

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
});`;

const nextjsClerkUser = `// app/api/autumn/[...all]/route.ts

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
});`;

const nextjsClerkOrg = `// app/api/autumn/[...all]/route.ts

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
});`;

const nextjsOther = `// app/api/autumn/[...all]/route.ts

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
});`;

export const getFrontendSnippet = (
	stack: StackType,
	productId?: string,
	featureId?: string,
): string => {
	const _actualProductId = productId || "your_product_id";
	const _actualFeatureId = featureId || "your_feature_id";

	switch (stack) {
		case "nextjs":
			return `import { AutumnProvider } from "autumn-js/react";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode,
}) {
  return (
    <html>
      <body>
        <AutumnProvider>
          {children}
        </AutumnProvider>
      </body>
    </html>
  );
}`;
		case "rr7":
			return `// app/root.tsx

import { AutumnProvider } from "autumn-js/react";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "@remix-run/react";

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <AutumnProvider>
          <Outlet />
        </AutumnProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}`;
		default:
			return `import { AutumnProvider } from "autumn-js/react";

// Wrap your app in AutumnProvider
function App() {
  return (
    <AutumnProvider>
      {/* Your app content */}
    </AutumnProvider>
  );
}`;
	}
};

// Usage example showing check() before track()
export const getUsageSnippet = (featureId?: string): string => {
	const actualFeatureId = featureId || "your_feature_id";

	return `import { useCustomer } from "autumn-js/react";
import { useState } from "react";

function MessageInput() {
  const { customer, check, track } = useCustomer();
  const [message, setMessage] = useState("");

  const handleSend = async () => {
    // 1. Check if user has access before tracking
    const { data } = await check({
      featureId: "${actualFeatureId}",
      requiredQuantity: 1
    });

    if (!data?.allowed) {
      alert("You've reached your limit!");
      return;
    }

    // 2. Track usage after successful check
    await track({
      featureId: "${actualFeatureId}",
      value: 1
    });

    // 3. Send the message
    // ... your message sending logic
  };

  return (
    <div>
      <input
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />
      <button onClick={handleSend}>
        Send Message
      </button>
    </div>
  );
}`;
};
