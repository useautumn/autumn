import type {
	AuthProvider,
	BackendStack,
	CustomerType,
	Snippet,
	StackConfig,
} from "./types";

export const REACT_SNIPPETS: Record<string, Snippet> = {
	install: {
		id: "install",
		title: "Install the SDK",
		description: "Add Autumn to your project using your package manager.",
		filename: "terminal",
		language: "bash",
		code: "npm install autumn-js",
	},
	"env-setup": {
		id: "env-setup",
		title: "Add your API key",
		description:
			"Generate a secret key in the Autumn dashboard and add it to your environment variables.",
		filename: ".env",
		language: "bash",
		code: "AUTUMN_SECRET_KEY=am_sk_42424242",
	},
	"add-provider": {
		id: "add-provider",
		title: "Add Autumn provider",
		description:
			"Wrap your app with the AutumnProvider to enable the React hooks. If your server URL is different to your client, you will pass in the backend URL as a prop.",
		filename: "layout.tsx",
		language: "tsx",
		code: `import { AutumnProvider } from "autumn-js/react";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AutumnProvider 
          backendUrl="http://localhost:8000"
          >
          {children}
        </AutumnProvider>
      </body>
    </html>
  );
}`,
	},
	"create-customer": {
		id: "create-customer",
		title: "Create a customer",
		description:
			"Use the useCustomer hook to access customer data. Customers are automatically created when they first interact with Autumn.",
		filename: "component.tsx",
		language: "tsx",
		code: `import { useCustomer } from "autumn-js/react";

function MyComponent() {
  const { customer, isLoading } = useCustomer();

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      <p>Customer ID: {customer?.id}</p>
    </div>
  );
}`,
	},
	attach: {
		id: "attach",
		title: "Attach a product",
		description: "Subscribe a customer to a product/plan.",
		filename: "billing.tsx",
		language: "tsx",
		code: `import { useCustomer } from "autumn-js/react";

function UpgradeButton() {
  const { attach } = useCustomer();

  const handleUpgrade = async () => {
    await attach({
      productId: "pro_plan",
      successUrl: "http://localhost:3000",
    });
  };

  return (
    <button onClick={handleUpgrade}>
      Upgrade to Pro
    </button>
  );
}`,
	},
	"billing-state": {
		id: "billing-state",
		title: "Get billing state",
		description:
			"Use usePricingTable to get products with their billing scenario for the current customer.",
		filename: "billing-page.tsx",
		language: "tsx",
		code: `import { usePricingTable } from "autumn-js/react";

const buttonText: Record<string, string> = {
  active: "Current Plan",
  upgrade: "Upgrade",
  downgrade: "Downgrade",
  scheduled: "Scheduled",
};

function PricingPage() {
  const { products } = usePricingTable();

  return (
    <>
      {products.map((product) => (
        <PricingCard
          key={product.id}
          name={product.name}
          buttonText={buttonText[product.scenario] ?? "Subscribe"}
        />
      ))}
    </>
  );
}`,
	},
	checkout: {
		id: "checkout",
		title: "Handle checkout",
		description:
			"Use checkout to initiate payment. It auto-redirects new customers to Stripe. For returning customers, it returns preview data.",
		filename: "pricing-card.tsx",
		language: "tsx",
		code: `import { useCustomer } from "autumn-js/react";

const { checkout, attach } = useCustomer();

const handleSelect = async (productId: string) => {
  const data = await checkout({ productId });

  if (!data.url) {
    // Returning customer → show confirmation dialog
    console.log("Preview:", data.product, data.total, data.currency);
    // Then call attach() to confirm the change
    await attach({ productId });
  }
};`,
	},
	"attach-pricing-table": {
		id: "attach-pricing-table",
		title: "Attach a product",
		description:
			"Drop in a pre-built pricing table that displays your products and handles checkout.",
		filename: "pricing.tsx",
		language: "tsx",
		code: `import { PricingTable } from "autumn-js/react";

export default function PricingPage() {
  return (
    <div className="w-full max-w-4xl mx-auto p-8">
      <PricingTable
        checkoutParams={{
          successUrl: "http://localhost:3000",
        }}
      />
    </div>
  );
}`,
	},
	"attach-custom": {
		id: "attach-custom",
		title: "Attach a product",
		description:
			"Build your own UI and use the attach function to subscribe customers to products.",
		filename: "billing.tsx",
		language: "tsx",
		code: `import { useCustomer } from "autumn-js/react";

function UpgradeButton() {
  const { attach } = useCustomer();

  const handleUpgrade = async () => {
    await attach({
      productId: "pro_plan",
      successUrl: "http://localhost:3000",
    });
  };

  return (
    <button onClick={handleUpgrade}>
      Upgrade to Pro
    </button>
  );
}`,
	},
	"attach-custom-prepaid": {
		id: "attach-custom-prepaid",
		title: "Attach a product",
		description:
			"Build your own UI and use the attach function to subscribe customers to products.",
		filename: "billing.tsx",
		language: "tsx",
		code: `import { useCustomer } from "autumn-js/react";

function UpgradeButton() {
  const { attach } = useCustomer();

  const handleUpgrade = async () => {
    await attach({
      productId: "pro_plan",
      successUrl: "http://localhost:3000",
      options: [
        { feature_id: "prepaid_feature", quantity: 10 }
      ],
    });
  };

  return (
    <button onClick={handleUpgrade}>
      Upgrade to Pro
    </button>
  );
}`,
	},
	check: {
		id: "check",
		title: "Check feature access",
		description:
			"Verify if a customer can use a feature before allowing access.",
		filename: "access.tsx",
		language: "tsx",
		code: `import { useCustomer } from "autumn-js/react";

function FeatureButton() {
  const { check } = useCustomer();

  const handleAction = async () => {
    const { data } = await check({
      featureId: "api_calls",
    });

    if (!data?.allowed) {
      alert("You've reached your limit!");
      return;
    }

    // Proceed with the action
  };

  return <button onClick={handleAction}>Use Feature</button>;
}`,
	},
	track: {
		id: "track",
		title: "Track feature usage",
		description: "Record usage events to enforce limits and track consumption.",
		filename: "usage.tsx",
		language: "tsx",
		code: `import { useCustomer } from "autumn-js/react";

function TrackUsageExample() {
  const { track } = useCustomer();

  const handleAction = async () => {
    await track({
      featureId: "api_calls",
      value: 1,
    });
  };

  return <button onClick={handleAction}>Track Usage</button>;
}`,
	},
};

export function getReactSnippet({
	id,
	stackConfig,
}: {
	id: string;
	stackConfig?: StackConfig;
}): Snippet {
	if (id === "backend-setup" && stackConfig) {
		return getBackendSetupSnippet(stackConfig);
	}
	return REACT_SNIPPETS[id];
}

function getBackendSetupSnippet(stackConfig: StackConfig): Snippet {
	const { backend, auth, customerType } = stackConfig;
	const code = getBackendSetupCode(backend, auth, customerType);
	const filename = getBackendFilename(backend);

	return {
		id: "backend-setup",
		title: "Mount autumnHandler to your backend",
		description:
			"This sets up routes on /api/autumn/* which allows the React hooks to interact with Autumn.",
		filename,
		language: "typescript",
		code,
	};
}

function getBackendFilename(backend: BackendStack): string {
	switch (backend) {
		case "nextjs":
			return "app/api/autumn/[...all]/route.ts";
		case "rr7":
			return "app/routes/api.autumn.$.tsx";
		case "express":
			return "server.js";
		case "hono":
			return "app.ts";
		case "elysia":
			return "index.ts";
		default:
			return "handler.ts";
	}
}

function getBackendSetupCode(
	backend: BackendStack,
	auth: AuthProvider,
	customerType: CustomerType,
): string {
	switch (backend) {
		case "nextjs":
			return getNextjsSnippet(auth, customerType);
		case "express":
			return getExpressSnippet(customerType);
		case "hono":
			return getHonoSnippet(customerType);
		case "elysia":
			return getElysiaSnippet(customerType);
		case "rr7":
			return getRR7Snippet(customerType);
		default:
			return getGeneralSnippet();
	}
}

function getNextjsSnippet(
	auth: AuthProvider,
	customerType: CustomerType,
): string {
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
}

const getExpressSnippet = (customerType: CustomerType): string => {
	return `import express from "express";
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

const getHonoSnippet = (customerType: CustomerType): string => {
	return `import { Hono } from "hono";
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

const getElysiaSnippet = (customerType: CustomerType): string => {
	return `import { Elysia } from "elysia";
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

const getRR7Snippet = (customerType: CustomerType): string => {
	return `import { autumnHandler } from "autumn-js/backend";
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

// Mount this handler onto the /api/autumn/* path in your backend

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
const nextjsBetterAuthUser = `import { autumnHandler } from "autumn-js/next";
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

const nextjsBetterAuthOrg = `import { autumnHandler } from "autumn-js/next";
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

const nextjsSupabaseUser = `import { autumnHandler } from "autumn-js/next";
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

const nextjsSupabaseOrg = `import { autumnHandler } from "autumn-js/next";
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

const nextjsClerkUser = `import { autumnHandler } from "autumn-js/next";
import { auth } from "@clerk/nextjs/server";

export const { GET, POST } = autumnHandler({
  identify: async () => {
    const { userId } = await auth();

    if (!userId) return null;

    return {
      customerId: userId,
      customerData: { name: "", email: "" },
    };
  },
});`;

const nextjsClerkOrg = `import { autumnHandler } from "autumn-js/next";
import { auth } from "@clerk/nextjs/server";

export const { GET, POST } = autumnHandler({
  identify: async () => {
    const { userId, orgId } = await auth();

    if (!userId || !orgId) return null;

    return {
      customerId: orgId,
      customerData: { name: "", email: "" },
    };
  },
});`;

const nextjsOther = `import { autumnHandler } from "autumn-js/next";

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
