import type { Snippet } from "./types";

const PYTHON_SNIPPETS: Record<string, Snippet> = {
	install: {
		id: "install",
		title: "Install the SDK",
		description: "Add Autumn to your project using pip.",
		filename: "terminal",
		language: "bash",
		code: "pip install autumn-sdk",
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
		filename: "customers.py",
		language: "python",
		code: `from autumn_sdk import Autumn

autumn = Autumn("am_sk_test_42424242")

customer = await autumn.customers.get_or_create(
    customer_id="user_or_org_id_from_auth",
    name="John Doe",
    email="john@example.com",
)`,
	},
	attach: {
		id: "attach",
		title: "Attach a plan",
		description:
			"Subscribe a customer to a plan. Returns a payment URL to redirect to.",
		filename: "billing.py",
		language: "python",
		code: `from autumn_sdk import Autumn

autumn = Autumn("am_sk_test_42424242")

response = await autumn.billing.attach(
    customer_id="user_or_org_id_from_auth",
    plan_id="pro_plan",
    redirect_mode="always",
)
# Redirect to response.payment_url`,
	},
	"billing-state": {
		id: "billing-state",
		title: "Get billing state",
		description:
			"Use plans.list with a customer_id to get plans with their billing scenario.",
		filename: "billing.py",
		language: "python",
		code: `from autumn_sdk import Autumn

autumn = Autumn("am_sk_test_42424242")

plans = await autumn.plans.list(customer_id="user_or_org_id_from_auth")

for plan in plans.list:
    print(plan.name, plan.customer_eligibility.scenario)`,
	},
	checkout: {
		id: "checkout",
		title: "Handle checkout",
		description:
			"Use attach with redirect_mode to handle payments. Returns a Stripe URL for new customers, or a confirmation page for returning customers.",
		filename: "billing.py",
		language: "python",
		code: `from autumn_sdk import Autumn

autumn = Autumn("am_sk_test_42424242")

response = await autumn.billing.attach(
    customer_id="user_or_org_id_from_auth",
    plan_id="pro_plan",
    redirect_mode="always",
)
# Redirect to response.payment_url`,
	},
	check: {
		id: "check",
		title: "Check feature access",
		description:
			"Verify if a customer can use a feature before allowing access.",
		filename: "access.py",
		language: "python",
		code: `from autumn_sdk import Autumn

autumn = Autumn("am_sk_test_42424242")

response = await autumn.check(
    customer_id="user_or_org_id_from_auth",
    feature_id="api_calls",
    required_balance=1,
)

if not response.allowed:
    print("Usage limit reached")
    return

# Safe to proceed`,
	},
	track: {
		id: "track",
		title: "Track feature usage",
		description: "Record usage events to enforce limits and track consumption.",
		filename: "usage.py",
		language: "python",
		code: `from autumn_sdk import Autumn

autumn = Autumn("am_sk_test_42424242")

await autumn.track(
    customer_id="user_or_org_id_from_auth",
    feature_id="api_calls",
    value=1,
)`,
	},
};

export function getPythonSnippet({ id }: { id: string }): Snippet {
	return PYTHON_SNIPPETS[id];
}
