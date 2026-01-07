import type { Snippet } from "./types";

export const NODE_SNIPPETS: Record<string, Snippet> = {
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
		code: "AUTUMN_SECRET_KEY=am_sk_...",
	},
	"create-customer": {
		id: "create-customer",
		title: "Create a customer",
		description:
			"Use the SDK to create a customer when a user signs up or when needed.",
		filename: "customers.ts",
		language: "typescript",
		code: `import Autumn from "autumn-js";

const autumn = new Autumn({
  secretKey: "am_sk_test_42424242",
});
		
// Create a customer
await autumn.customers.create({
  id: "user_or_org_id_from_auth",
  name: "John Doe",
  email: "john@example.com",
});`,
	},
	attach: {
		id: "attach",
		title: "Attach a product",
		description: "Subscribe a customer to a product/plan.",
		filename: "billing.ts",
		language: "typescript",
		code: `import Autumn from "autumn-js";

const autumn = new Autumn({
  secretKey: "am_sk_test_42424242",
});

// Attach a product to a customer
await autumn.attach({
  customerId: "user_or_org_id_from_auth",
  productId: "pro_plan",
  successUrl: "http://localhost:3000",
});`,
	},
	check: {
		id: "check",
		title: "Check feature access",
		description:
			"Verify if a customer can use a feature before allowing access.",
		filename: "access.ts",
		language: "typescript",
		code: `import Autumn from "autumn-js";

const autumn = new Autumn({
  secretKey: "am_sk_test_42424242",
});

// Check if customer can use a feature
const { data } = await autumn.check({
  customerId: "user_or_org_id_from_auth",
  featureId: "api_calls",
});

if (data.allowed) {
  // Allow the action
}`,
	},
	track: {
		id: "track",
		title: "Track feature usage",
		description: "Record usage events to enforce limits and track consumption.",
		filename: "usage.ts",
		language: "typescript",
		code: `import Autumn from "autumn-js";

const autumn = new Autumn({
  secretKey: "am_sk_test_42424242",
});

// Track usage of a feature
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
