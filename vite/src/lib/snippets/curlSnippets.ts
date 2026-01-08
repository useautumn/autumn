import type { Snippet } from "./types";

export const CURL_SNIPPETS: Record<string, Snippet> = {
	"env-setup": {
		id: "env-setup",
		title: "Get your API key",
		description:
			"Generate a secret key in the Autumn dashboard. You'll use this in the Authorization header.",
		filename: "terminal",
		language: "bash",
		code: "# Your secret key: am_sk_...",
	},
	"create-customer": {
		id: "create-customer",
		title: "Create a customer",
		description: "Use the REST API to create a customer.",
		filename: "terminal",
		language: "bash",
		code: `curl -X POST https://api.useautumn.com/v1/customers \\
  -H "Authorization: Bearer am_sk_test_42424242" \\
  -H "Content-Type: application/json" \\
  -d '{
    "id": "user_or_org_id_from_auth",
    "name": "John Doe",
    "email": "john@example.com"
  }'`,
	},
	attach: {
		id: "attach",
		title: "Attach a product",
		description: "Subscribe a customer to a product/plan.",
		filename: "terminal",
		language: "bash",
		code: `curl -X POST https://api.useautumn.com/v1/attach \\
  -H "Authorization: Bearer am_sk_test_42424242" \\
  -H "Content-Type: application/json" \\
  -d '{
    "customer_id": "user_or_org_id_from_auth",
    "product_id": "pro_plan",
    "success_url": "http://localhost:3000"
  }'`,
	},
	"billing-state": {
		id: "billing-state",
		title: "Get billing state",
		description:
			"Get products with their billing scenario for a customer.",
		filename: "terminal",
		language: "bash",
		code: `# Get products with billing scenarios
curl "https://api.useautumn.com/v1/products?customer_id=user_or_org_id_from_auth" \\
  -H "Authorization: Bearer am_sk_test_42424242"

# Response includes scenario for each product:
# "active" | "upgrade" | "downgrade" | "scheduled" | "new"`,
	},
	checkout: {
		id: "checkout",
		title: "Handle checkout",
		description:
			"Initiate checkout. Returns a Stripe URL for new customers, or preview data for returning customers.",
		filename: "terminal",
		language: "bash",
		code: `# Step 1: Get checkout info
curl -X POST https://api.useautumn.com/v1/checkout \\
  -H "Authorization: Bearer am_sk_test_42424242" \\
  -H "Content-Type: application/json" \\
  -d '{
    "customer_id": "user_or_org_id_from_auth",
    "product_id": "pro_plan"
  }'

# If response has "url" → redirect to Stripe
# If no "url" → show confirmation, then call /attach`,
	},
	check: {
		id: "check",
		title: "Check feature access",
		description:
			"Verify if a customer can use a feature before allowing access.",
		filename: "terminal",
		language: "bash",
		code: `curl -X POST https://api.useautumn.com/v1/check \\
  -H "Authorization: Bearer am_sk_test_42424242" \\
  -H "Content-Type: application/json" \\
  -d '{
    "customer_id": "user_or_org_id_from_auth",
    "feature_id": "api_calls"
  }'`,
	},
	track: {
		id: "track",
		title: "Track feature usage",
		description: "Record usage events to enforce limits and track consumption.",
		filename: "terminal",
		language: "bash",
		code: `curl -X POST https://api.useautumn.com/v1/track \\
  -H "Authorization: Bearer am_sk_test_42424242" \\
  -H "Content-Type: application/json" \\
  -d '{
    "customer_id": "user_or_org_id_from_auth",
    "feature_id": "api_calls",
    "value": 1
  }'`,
	},
};

export function getCurlSnippet({ id }: { id: string }): Snippet {
	return CURL_SNIPPETS[id];
}
