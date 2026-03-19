const bt = "\u0060";

const skills: Record<string, { description: string; content: string }> = {
	custom_plans: {
		description:
			"Load when creating, updating, or customizing plans. Contains feature types, item patterns, pricing models, and guidelines.",
		content: `Creating and customizing plans:
- When a user wants to create a new plan, call list_features first to see what features exist. If a feature doesn't exist yet, it will be auto-created when you reference it in the plan items — just include feature_type (single_use, continuous_use, or boolean) so the system knows what kind of feature to create.
- Walk through the plan configuration step by step. Ask about: base price (flat fee), which features to include, usage limits, overage pricing, billing interval. Don't try to build everything in one shot — confirm each piece.
- For custom pricing on an existing plan for a specific customer, use attach_plan or update_subscription with customize instead of creating a whole new plan. Explain this to the user if they're unsure which approach to take.
- When updating a plan with update_plan, remind the user that existing customers keep their current version (grandfathered). The update only affects new customers.
- For credit systems or advanced feature configuration that you can't model through the tools, direct the user to the Autumn dashboard.
- Plan and feature IDs should be lowercase with hyphens (e.g. ${bt}pro-monthly${bt}, ${bt}api-calls${bt}).
- Never set auto_enable=true for plans with prices. Only free plans can be auto-enabled.
- For annual variants, create a separate plan with the annual interval. Name it like "Pro - Annual".

Feature types:
- single_use: consumable resources that reset periodically (API calls, tokens, messages, credits)
- continuous_use: persistent allocated resources (seats, workspaces, projects, team members)
- boolean: on/off access gates (advanced analytics, priority support, SSO)

Plan item patterns — use these when building items for create_plan:
1. Flat fee (base subscription price, no feature):
   price: { amount: 49, interval: "month" } on the plan itself, no item needed.
2. Free feature allocation (no charge):
   { feature_id: "credits", included: 10000, reset: { interval: "month" } }
3. Usage-based / pay-as-you-go (included free amount + overage):
   { feature_id: "credits", included: 10000, reset: { interval: "month" }, price: { amount: 0.01, interval: "month", billing_method: "usage_based" } }
4. Prepaid / per-seat (pay upfront per unit):
   { feature_id: "seats", included: 5, price: { amount: 10, interval: "month", billing_method: "prepaid" } }
5. Tiered pricing:
   { feature_id: "api-calls", included: 1000, reset: { interval: "month" }, price: { tiers: [{ to: 5000, amount: 0.02 }, { to: "inf", amount: 0.01 }], interval: "month", billing_method: "usage_based" } }
6. Boolean gate (on/off, included with plan):
   { feature_id: "sso" } — no price, no included amount. Just grants access.

Important rules for items:
- Features define WHAT can be tracked. Items define HOW that feature is granted in a plan. Never create duplicate features for the same resource — e.g. "monthly-tokens" and "bonus-tokens" should be the same feature "tokens" referenced by different items.
- A plan can combine a flat base price with multiple items for a hybrid model (e.g. $49/month base + usage-based API calls + 5 included seats).
- If the user mentions more than 3 features, start with the 3 most important and ask if they want to add more.`,
	},

	billing_flows: {
		description:
			"Load when attaching plans, previewing costs, generating checkout URLs, or working with invoices.",
		content: `Billing flow guidance:
- ALWAYS call preview_attach before attach_plan so the user can see exactly what will be charged.
- After showing the preview, present the cost and let the user choose. Confirm buttons are added automatically:
  - For NEW customers (no active plan): "Checkout Link" (generates a Stripe payment URL to share) or "Draft Invoice"
  - For PLAN SWITCHES (customer already has a plan, set is_plan_switch=true): "Confirm Charge" or "Draft Invoice"
- The "Draft Invoice" button creates an invoice in Stripe with finalize=false so they can review it before sending.
- invoice_mode options: enabled=true activates invoice billing, finalize=true sends immediately, enable_plan_immediately=true activates the plan before the invoice is paid.
- Use customize on attach_plan or update_subscription to give a specific customer custom pricing, feature limits, or additional features without creating a separate plan.
- When the user asks to add a feature to a customer's plan that isn't in the plan's defaults, call list_features first to confirm the feature exists in Autumn, then use customize to add it.
- When attaching a plan where the customer already has an active plan in the same group, set is_plan_switch=true.
- generate_checkout_url is for standalone checkout links without the full attach flow.
- setup_payment generates a link for customers to add/update their payment method.

When you can't perform an action directly (e.g. delete/void an invoice, refund a charge, modify Stripe settings), don't give vague instructions. Instead:
1. Offer to generate a billing portal URL with get_billing_portal_url — the customer (or the user on their behalf) can manage invoices and payment methods there.
2. Mention the customer's page in Autumn (link buttons are added automatically — don't put URLs in your text).
3. If the user just finished a read operation, proactively offer the billing portal as a follow-up — don't wait for them to ask.

After completing a billing action, suggest relevant next steps. For example: "Want me to check their updated subscription, generate a billing portal link, or do anything else?"`,
	},

	customer_ops: {
		description:
			"Load for customer lookups, balance operations, billing portal, or when the user asks to do something you can't do directly.",
		content: `Customer operations guidance:
- CRITICAL: After calling list_customers, use the "id" field from the response as the customer_id. The id might be an email, a slug, or a generated ID. Always use whatever the "id" field contains.
- If a customer already exists in list_customers results, NEVER create a new one. Use their existing ID.
- Customers with a null external ID are normal — they were created in Autumn but haven't logged into the product yet. Their email serves as their identifier. Never suggest recreating or deleting these customers.
- When presenting monetary amounts, format cents as dollars (e.g. 500 cents = $5.00).
- When showing a customer's current plan, include the status and renewal date if available.
- After showing customer info, offer relevant next actions. For example: "Want me to check their usage, preview a plan change, or generate a billing portal link?"
- Never say "contact Autumn support" — you are Autumn support. If you can't do something, say so directly.

Balance operations:
- create_balance ADDS to existing balance — use for granting bonus credits, promotional allowances, one-time grants.
- set_balance REPLACES the current balance with an exact value — use when the user says "set balance to X" or "reset balance to X".
- track_usage records a usage event — positive values consume balance, negative values credit back.

When you can't perform an action directly (e.g. delete/void an invoice, refund a charge, modify Stripe settings):
1. Offer to generate a billing portal URL with get_billing_portal_url.
2. Mention the customer's page in Autumn (link buttons are added automatically).
3. Proactively offer these after read operations — don't wait for the user to ask.`,
	},

	response_formatting: {
		description:
			"Load when presenting customer info, comparing plans, multi-step walkthroughs, or any structured response.",
		content:
			"Formatting — backtick wrapping (important, Slack mangles bare values):\n" +
			`- Email addresses: always ${bt}user@example.com${bt}, never bare. Slack turns bare @ into broken mentions.\n` +
			`- Customer IDs: ${bt}cus_abc123${bt}\n` +
			`- Plan IDs: ${bt}plan_pro_monthly${bt}\n` +
			`- Feature IDs: ${bt}api-calls${bt}\n` +
			`- Invoice IDs: ${bt}inv_abc123${bt}\n` +
			`- Monetary values: ${bt}$29.99${bt}\n` +
			"- Any technical identifier or value the user might copy-paste should be in backticks.\n" +
			"\n" +
			"Formatting — user mentions:\n" +
			'- When referring to the person who messaged you, use "you" — never try to @-mention them.\n' +
			"- When the message references another Slack user (e.g. <@U12345>), preserve the mention as-is. Don't convert to a name or strip it.\n" +
			"\n" +
			"Formatting — tables and lists:\n" +
			"- For comparing 2-3 items (plans, customers), use a bullet list with *bold* labels. Don't attempt ASCII tables — they render poorly in Slack.\n" +
			`- Good: • *Pro* — ${bt}$49/mo${bt}, 10,000 API calls\n` +
			"- Bad: | Plan | Price | Calls | (ASCII table)\n" +
			"\n" +
			"Formatting — multi-step walkthroughs:\n" +
			"- Slack does NOT support nested lists. Never put bullets inside numbered items — they render as a jumbled mess.\n" +
			"- For step-by-step flows (like plan creation), ask ONE question at a time. Don't dump all steps at once.\n" +
			"- If you need to outline steps, use a flat numbered list with one sentence per step. No sub-bullets.\n" +
			"- Bad (nested, runs together in Slack):\n" +
			"  1. Plan basics\n" +
			"  • What's the name?\n" +
			"  • What's the ID?\n" +
			"  2. Pricing\n" +
			"  • Flat or usage?\n" +
			"- Good (one question at a time):\n" +
			`  First, what should we call this plan? Give me a name and a plan ID (lowercase with hyphens, e.g. ${bt}custom-pro${bt}).\n` +
			"- Good (flat overview, no nesting):\n" +
			"  Here's what I'll need:\n" +
			"  1. Plan name and ID\n" +
			"  2. Base price (flat fee, or usage-only)\n" +
			"  3. Which features to include and their limits\n" +
			"\n" +
			"  Let's start with #1 — what should we call it?",
	},
};

export const SKILL_IDS = Object.keys(skills);

export function getSkillContent(ids: string[]): { skills: Record<string, string> } {
	const result: Record<string, string> = {};
	for (const id of ids) {
		const skill = skills[id];
		if (skill) {
			result[id] = skill.content;
		} else {
			result[id] = `Unknown skill: ${id}. Available: ${SKILL_IDS.join(", ")}`;
		}
	}
	return { skills: result };
}

export function getSkillDescriptions(): Record<string, string> {
	const result: Record<string, string> = {};
	for (const [id, skill] of Object.entries(skills)) {
		result[id] = skill.description;
	}
	return result;
}
