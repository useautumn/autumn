import type { Snippet } from "./types";

export const PYTHON_SNIPPETS: Record<string, Snippet> = {
	install: {
		id: "install",
		title: "Install the SDK",
		description: "Add Autumn to your project using pip.",
		filename: "terminal",
		language: "bash",
		code: "pip install autumn-py",
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
		filename: "customers.py",
		language: "python",
		code: `from autumn import Autumn

autumn = Autumn(secret_key="am_sk_test_42424242")

# Create a customer
autumn.customers.create(
    id="user_or_org_id_from_auth",
    name="John Doe",
    email="john@example.com"
)`,
	},
	attach: {
		id: "attach",
		title: "Attach a product",
		description: "Subscribe a customer to a product/plan.",
		filename: "billing.py",
		language: "python",
		code: `from autumn import Autumn

autumn = Autumn(secret_key="am_sk_test_42424242")

# Attach a product to a customer
autumn.attach(
    customer_id="user_or_org_id_from_auth",
    product_id="pro_plan",
    success_url="http://localhost:3000"
)`,
	},
	check: {
		id: "check",
		title: "Check feature access",
		description:
			"Verify if a customer can use a feature before allowing access.",
		filename: "access.py",
		language: "python",
		code: `from autumn import Autumn

autumn = Autumn(secret_key="am_sk_test_42424242")

# Check if customer can use a feature
result = autumn.check(
    customer_id="user_or_org_id_from_auth",
    feature_id="api_calls"
)

if result.allowed:
    # Allow the action
    pass`,
	},
	track: {
		id: "track",
		title: "Track feature usage",
		description: "Record usage events to enforce limits and track consumption.",
		filename: "usage.py",
		language: "python",
		code: `from autumn import Autumn

autumn = Autumn(secret_key="am_sk_test_42424242")

# Track usage of a feature
autumn.track(
    customer_id="user_or_org_id_from_auth",
    feature_id="api_calls",
    value=1
)`,
	},
};

export function getPythonSnippet({ id }: { id: string }): Snippet {
	return PYTHON_SNIPPETS[id];
}
