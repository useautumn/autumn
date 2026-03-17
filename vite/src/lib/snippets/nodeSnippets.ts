import type { Snippet } from "./types";

const NODE_SNIPPETS: Record<string, Snippet> = {
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
	"create-customer": {
		id: "create-customer",
		title: "Create a customer",
		description:
			"Use the SDK to create a customer when a user signs up or when needed. Autumn will auto-enable any free plan.",
		filename: "customers.ts",
		language: "typescript",
		code: `import { Autumn } from "autumn-js";

const autumn = new Autumn({
  secretKey: process.env.AUTUMN_SECRET_KEY,
});

const customer = await autumn.customers.getOrCreate({
  customerId: "user_or_org_id_from_auth",
  name: "John Doe",
  email: "john@example.com",
});`,
	},
	attach: {
		id: "attach",
		title: "Attach a plan",
		description:
			"Subscribe a customer to a plan. Returns a payment URL to redirect to.",
		filename: "billing.ts",
		language: "typescript",
		code: `import { Autumn } from "autumn-js";

const autumn = new Autumn({
  secretKey: process.env.AUTUMN_SECRET_KEY,
});

const response = await autumn.billing.attach({
  customerId: "user_or_org_id_from_auth",
  planId: "pro_plan",
  redirectMode: "always",
});

redirect(response.paymentUrl);`,
	},
	"billing-state": {
		id: "billing-state",
		title: "Get billing state",
		description:
			"Use plans.list with a customerId to get plans with their billing scenario.",
		filename: "billing.ts",
		language: "typescript",
		code: `import { Autumn } from "autumn-js";

const autumn = new Autumn({
  secretKey: process.env.AUTUMN_SECRET_KEY,
});

const { list: plans } = await autumn.plans.list({
  customerId: "user_or_org_id_from_auth",
});

for (const plan of plans) {
  console.log(plan.name, plan.customerEligibility?.scenario);
  // e.g. "Free" "downgrade", "Pro" "active", "Enterprise" "upgrade"
}`,
	},
	checkout: {
		id: "checkout",
		title: "Handle checkout",
		description:
			"Use attach with redirectMode to handle payments. Returns a Stripe URL for new customers, or a confirmation page for returning customers.",
		filename: "billing.ts",
		language: "typescript",
		code: `import { Autumn } from "autumn-js";

const autumn = new Autumn({
  secretKey: process.env.AUTUMN_SECRET_KEY,
});

const response = await autumn.billing.attach({
  customerId: "user_or_org_id_from_auth",
  planId: "pro_plan",
  redirectMode: "always",
});

// Redirect customer to complete payment or confirm plan change
redirect(response.paymentUrl);`,
	},
	check: {
		id: "check",
		title: "Check feature access",
		description:
			"Verify if a customer can use a feature before allowing access.",
		filename: "access.ts",
		language: "typescript",
		code: `import { Autumn } from "autumn-js";

const autumn = new Autumn({
  secretKey: process.env.AUTUMN_SECRET_KEY,
});

const { allowed } = await autumn.check({
  customerId: "user_or_org_id_from_auth",
  featureId: "api_calls",
  requiredBalance: 1,
});

if (!allowed) {
  console.log("Usage limit reached");
  return;
}

// Safe to proceed`,
	},
	track: {
		id: "track",
		title: "Track feature usage",
		description: "Record usage events to enforce limits and track consumption.",
		filename: "usage.ts",
		language: "typescript",
		code: `import { Autumn } from "autumn-js";

const autumn = new Autumn({
  secretKey: process.env.AUTUMN_SECRET_KEY,
});

await autumn.track({
  customerId: "user_or_org_id_from_auth",
  featureId: "api_calls",
  value: 1,
});`,
	},
};

export function getNodeSnippet({ id }: { id: string }): Snippet {
	return NODE_SNIPPETS[id];
}
