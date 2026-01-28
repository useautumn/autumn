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
	"billing-state": {
		id: "billing-state",
		title: "Get billing state",
		description:
			"Use products.list with a customer_id to get products with their billing scenario.",
		filename: "billing.ts",
		language: "typescript",
		code: `import Autumn from "autumn-js";

const autumn = new Autumn({
  secretKey: "am_sk_test_42424242",
});

const buttonText: Record<string, string> = {
  active: "Current Plan",
  upgrade: "Upgrade",
  downgrade: "Downgrade",
  scheduled: "Scheduled",
};

const { data } = await autumn.products.list({
  customerId: "user_or_org_id_from_auth",
});

const products = data.list.map((product) => ({
  id: product.id,
  name: product.name,
  buttonText: buttonText[product.scenario] ?? "Subscribe",
}));`,
	},
	checkout: {
		id: "checkout",
		title: "Handle checkout",
		description:
			"Use checkout to initiate payment. Returns a Stripe URL for new customers, or preview data for returning customers.",
		filename: "billing.ts",
		language: "typescript",
		code: `import Autumn from "autumn-js";

const autumn = new Autumn({
  secretKey: "am_sk_test_42424242",
});

const { data } = await autumn.checkout({
  customerId: "user_or_org_id_from_auth",
  productId: "pro_plan",
});

if (data.url) {
  // New customer → redirect to Stripe
  return redirect(data.url);
}

// Returning customer → return preview for confirmation UI
console.log("Preview:", data.product, data.total, data.currency);

// After user confirms:
await autumn.attach({
  customerId: "user_or_org_id_from_auth",
  productId: "pro_plan",
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
