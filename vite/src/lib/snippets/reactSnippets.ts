import type {
	AuthProvider,
	BackendStack,
	CustomerType,
	Snippet,
	StackConfig,
} from "./types";

const REACT_SNIPPETS: Record<string, Snippet> = {
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
		code: "AUTUMN_SECRET_KEY=am_sk_test_42424242...",
	},
	"add-provider": {
		id: "add-provider",
		title: "Add Autumn provider",
		description:
			"Wrap your app with the AutumnProvider to enable the React hooks.",
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
        <AutumnProvider>
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
  const { data } = useCustomer();

  return (
    <div>
      <p>Customer: {data?.name}</p>
    </div>
  );
}`,
	},
	attach: {
		id: "attach",
		title: "Attach a plan",
		description:
			"Subscribe a customer to a plan. Handles upgrades, downgrades, and new subscriptions.",
		filename: "billing.tsx",
		language: "tsx",
		code: `import { useCustomer } from "autumn-js/react";

export default function PurchaseButton() {
  const { attach } = useCustomer();

  return (
    <button
      onClick={async () => {
        await attach({
          planId: "pro_plan",
          redirectMode: "always",
        });
      }}
    >
      Select Pro Plan
    </button>
  );
}`,
	},
	"billing-state": {
		id: "billing-state",
		title: "Get billing state",
		description:
			"Use useListPlans to get plans with their billing scenario for the current customer.",
		filename: "billing-page.tsx",
		language: "tsx",
		code: `import { useListPlans, useCustomer } from "autumn-js/react";

const buttonText: Record<string, string> = {
  active: "Current plan",
  upgrade: "Upgrade",
  downgrade: "Downgrade",
  new: "Get started",
};

export default function PricingPage() {
  const { data: plans } = useListPlans();
  const { attach } = useCustomer();

  return (
    <>
      {plans?.map((plan) => (
        <button
          key={plan.id}
          disabled={plan.customerEligibility?.scenario === "active"}
          onClick={() => attach({ planId: plan.id })}
        >
          {buttonText[plan.customerEligibility?.scenario] ?? "Get started"}
        </button>
      ))}
    </>
  );
}`,
	},
	checkout: {
		id: "checkout",
		title: "Handle checkout",
		description:
			"Use attach with redirectMode to handle payments. New customers go to Stripe Checkout, returning customers see a confirmation page.",
		filename: "pricing-card.tsx",
		language: "tsx",
		code: `import { useCustomer } from "autumn-js/react";

export default function UpgradeButton() {
  const { attach } = useCustomer();

  return (
    <button
      onClick={async () => {
        await attach({
          planId: "pro_plan",
          redirectMode: "always",
        });
      }}
    >
      Upgrade to Pro
    </button>
  );
}`,
	},
	// "attach-pricing-table": {
	// 	id: "attach-pricing-table",
	// 	title: "Attach a plan",
	// 	description:
	// 		"Drop in a pre-built pricing table that displays your plans and handles checkout.",
	// 	filename: "pricing.tsx",
	// 	language: "tsx",
	// 	code: `import { PricingTable } from "autumn-js/react";
	//
	// export default function PricingPage() {
	//   return (
	//     <div className="w-full max-w-4xl mx-auto p-8">
	//       <PricingTable />
	//     </div>
	//   );
	// }`,
	// },
	"attach-custom": {
		id: "attach-custom",
		title: "Attach a plan",
		description:
			"Build your own UI and use the attach function to subscribe customers to plans.",
		filename: "billing.tsx",
		language: "tsx",
		code: `import { useCustomer } from "autumn-js/react";

export default function UpgradeButton() {
  const { attach } = useCustomer();

  return (
    <button
      onClick={async () => {
        await attach({
          planId: "pro_plan",
          redirectMode: "always",
        });
      }}
    >
      Upgrade to Pro
    </button>
  );
}`,
	},
	"attach-custom-prepaid": {
		id: "attach-custom-prepaid",
		title: "Attach a plan",
		description:
			"Build your own UI and use attach with options for prepaid purchases.",
		filename: "billing.tsx",
		language: "tsx",
		code: `import { useCustomer } from "autumn-js/react";

export default function TopUpButton() {
  const { attach } = useCustomer();

  return (
    <button
      onClick={async () => {
        await attach({
          planId: "pro_plan",
          options: [
            { featureId: "prepaid_feature", quantity: 10 }
          ],
        });
      }}
    >
      Buy More
    </button>
  );
}`,
	},
	check: {
		id: "check",
		title: "Check feature access",
		description:
			"Verify if a customer can use a feature before allowing access. Client-side checks are for UX only.",
		filename: "access.tsx",
		language: "tsx",
		code: `import { useCustomer } from "autumn-js/react";

function FeatureButton() {
  const { check, refetch } = useCustomer();

  const handleAction = async () => {
    const { allowed } = check({
      featureId: "api_calls",
    });

    if (!allowed) {
      alert("You've reached your limit!");
      return;
    }

    // Proceed with the action, then refresh usage data
    await refetch();
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
		case "hono":
			return "app.ts";
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
		case "hono":
			return getHonoSnippet(auth, customerType);
		default:
			return getGenericSnippet(customerType);
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

function getHonoSnippet(
	auth: AuthProvider,
	customerType: CustomerType,
): string {
	switch (auth) {
		case "betterauth":
			return customerType === "user" ? honoBetterAuthUser : honoBetterAuthOrg;
		default:
			return honoOther(customerType);
	}
}

const getGenericSnippet = (customerType: CustomerType): string => {
	return `import { autumnHandler } from "autumn-js/backend";

// Mount this handler onto the /api/autumn/* path in your backend

const handleRequest = async (request) => {
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
};`;
};

// Next.js specific snippets (using autumn-js/next adapter)
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

// Hono specific snippets (using autumn-js/hono adapter)
const honoBetterAuthUser = `import { autumnHandler } from "autumn-js/hono";
import { auth } from "./lib/auth";

app.use("/api/autumn/*", autumnHandler({
  identify: async (c) => {
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });

    return {
      customerId: session?.user.id,
      customerData: {
        name: session?.user.name,
        email: session?.user.email,
      },
    };
  },
}));`;

const honoBetterAuthOrg = `import { autumnHandler } from "autumn-js/hono";
import { auth } from "./lib/auth";

app.use("/api/autumn/*", autumnHandler({
  identify: async (c) => {
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });

    return {
      customerId: session?.session.activeOrganizationId,
      customerData: {
        name: session?.user.name,
        email: session?.user.email,
      },
    };
  },
}));`;

const honoOther = (customerType: CustomerType): string => {
	return `import { autumnHandler } from "autumn-js/hono";

app.use("/api/autumn/*", autumnHandler({
  identify: async (c) => {
    // Your authentication logic here
    const customerId = "${customerType === "user" ? "user_id" : "org_id"}";

    return {
      customerId,
      customerData: { name: "", email: "" },
    };
  },
}));`;
};
