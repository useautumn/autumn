import type Anthropic from "@anthropic-ai/sdk";
import { SKILL_IDS } from "@/agent/skills";

const p = {
	customer_id: {
		type: "string",
		description:
			"The exact customer ID from a previous API response (e.g. from list_customers). Never guess — always look it up first.",
	},
	feature_id: {
		type: "string",
		description:
			"The feature ID (e.g. 'api-calls', 'seats'). Use list_features if unsure of the exact ID.",
	},
	plan_id: {
		type: "string",
		description: "The plan ID (e.g. 'pro', 'starter'). Use list_plans if unsure of the exact ID.",
	},
};

function defineTool(
	name: string,
	description: string,
	properties: Record<string, unknown>,
	required: string[] = [],
): Anthropic.Tool {
	return { name, description, input_schema: { type: "object" as const, properties, required } };
}

const intervalEnum = ["one_off", "week", "month", "quarter", "semi_annual", "year"];
const resetIntervalEnum = [
	"one_off",
	"minute",
	"hour",
	"day",
	"week",
	"month",
	"quarter",
	"semi_annual",
	"year",
];

const planItemSchema = {
	type: "object",
	description: "A feature configuration within a plan.",
	properties: {
		feature_id: {
			type: "string",
			description:
				"The feature ID. If it doesn't exist yet, it will be auto-created (provide feature_type for metered features).",
		},
		feature_type: {
			type: "string",
			enum: ["single_use", "continuous_use", "boolean"],
			description:
				"Type for auto-creating the feature. single_use = consumable (API calls, credits), continuous_use = allocated (seats, projects), boolean = on/off gate. Only needed if the feature doesn't already exist.",
		},
		included: {
			type: "number",
			description:
				"Free units included with the plan. Resets each interval for consumable features.",
		},
		unlimited: { type: "boolean", description: "If true, unlimited access to this feature." },
		reset: {
			type: "object",
			description: "Reset config for consumable features. Omit for non-consumable (seats).",
			properties: {
				interval: {
					type: "string",
					enum: resetIntervalEnum,
					description: "Reset interval (e.g. 'month').",
				},
				interval_count: {
					type: "number",
					description: "Number of intervals between resets. Default 1.",
				},
			},
			required: ["interval"],
		},
		price: {
			type: "object",
			description: "Pricing for usage beyond included units. Omit for free features.",
			properties: {
				amount: {
					type: "number",
					description: "Price per billing_units. Use this OR tiers, not both.",
				},
				tiers: {
					type: "array",
					description:
						"Tiered pricing. Each tier has 'to' (upper limit, or 'inf') and 'amount' (price per unit).",
					items: {
						type: "object",
						properties: {
							to: { description: "Upper limit of this tier (number or 'inf' for unlimited)." },
							amount: { type: "number", description: "Price per unit in this tier." },
						},
						required: ["to", "amount"],
					},
				},
				interval: {
					type: "string",
					enum: intervalEnum,
					description: "Billing interval. Should match reset.interval for consumable features.",
				},
				billing_units: {
					type: "number",
					description:
						"Units per price increment. E.g. billing_units=100 means pricing is per 100 units.",
				},
				billing_method: {
					type: "string",
					enum: ["prepaid", "usage_based"],
					description:
						"prepaid = upfront payment (seats), usage_based = pay-as-you-go (API calls).",
				},
				max_purchase: { type: "number", description: "Max purchasable units beyond included." },
			},
			required: ["interval", "billing_method"],
		},
		proration: {
			type: "object",
			description: "Mid-cycle billing behavior for prepaid features (seats). Usually not needed.",
			properties: {
				on_increase: {
					type: "string",
					enum: [
						"bill_immediately",
						"prorate_immediately",
						"prorate_next_cycle",
						"bill_next_cycle",
					],
				},
				on_decrease: {
					type: "string",
					enum: ["prorate", "prorate_immediately", "prorate_next_cycle", "none", "no_prorations"],
				},
			},
			required: ["on_increase", "on_decrease"],
		},
		rollover: {
			type: "object",
			description: "Carry over unused units to the next cycle.",
			properties: {
				max: { type: "number", description: "Max rollover units. Omit for unlimited." },
				expiry_duration_type: { type: "string", enum: ["month", "forever"] },
				expiry_duration_length: { type: "number", description: "Periods before rollover expires." },
			},
			required: ["expiry_duration_type"],
		},
	},
	required: ["feature_id"],
};

const basePriceSchema = {
	type: "object",
	description: "Base recurring price for the plan (e.g. $49/month flat fee).",
	properties: {
		amount: { type: "number", description: "Price amount in dollars." },
		interval: { type: "string", enum: intervalEnum, description: "Billing interval." },
		interval_count: { type: "number", description: "Number of intervals per cycle. Default 1." },
	},
	required: ["amount", "interval"],
};

const freeTrialSchema = {
	type: "object",
	description: "Free trial configuration.",
	properties: {
		duration_length: { type: "number", description: "Length of the trial period." },
		duration_type: {
			type: "string",
			enum: ["day", "month", "year"],
			description: "Unit for the trial length. Default: day.",
		},
		card_required: {
			type: "boolean",
			description: "If true, payment method required to start trial.",
		},
	},
	required: ["duration_length"],
};

const customizeSchema = {
	type: "object",
	description:
		"Override the plan's defaults for this specific customer. Use to give a customer custom pricing, custom feature limits, or a custom trial without creating a separate plan.",
	properties: {
		price: {
			...basePriceSchema,
			description: "Override the base price. Pass null to remove the base price entirely.",
		},
		items: {
			type: "array",
			items: planItemSchema,
			description:
				"Override feature configurations. Replaces the plan's default items for this customer.",
		},
		free_trial: {
			...freeTrialSchema,
			description: "Override the trial. Pass null to remove the trial.",
		},
	},
};

const baseReadTools = [
	defineTool(
		"get_skill",
		"Load contextual guidance and unlock additional tools before responding. Call this for any non-trivial response. Pass one or more skill IDs. Skills are cached in conversation history — only load each once per thread. Loading 'custom_plans' unlocks create_plan and update_plan. Loading 'billing_flows' unlocks attach_plan, preview_attach, and update_subscription.",
		{
			skill_ids: {
				type: "array",
				items: {
					type: "string",
					enum: SKILL_IDS,
				},
				description:
					"custom_plans = creating/updating/customizing plans and pricing. billing_flows = attaching plans, previewing costs, invoices, checkout. customer_ops = customer lookups, balances, billing portal, unsupported actions. response_formatting = how to format responses in Slack (backticks, lists, walkthroughs).",
			},
		},
		["skill_ids"],
	),
	defineTool(
		"get_customer",
		"Look up a single customer by their exact ID. Returns their current plan, subscription status, feature balances, and renewal info. Use expand to include invoices, entities, rewards, or payment method. This is the primary tool for answering questions about a specific customer.",
		{
			customer_id: p.customer_id,
			expand: {
				type: "array",
				items: {
					type: "string",
					enum: ["invoices", "entities", "rewards", "payment_method"],
				},
				description:
					"Additional data to include. Use 'invoices' when asked about billing history, 'payment_method' when asked about payment info, 'entities' for sub-resources like team members.",
			},
		},
		["customer_id"],
	),
	defineTool(
		"list_customers",
		"List all customers with pagination. Use this when a user refers to a customer by name or email — search the results to find the matching customer ID. Also use when asked for an overview of all customers.",
		{
			limit: { type: "number", description: "Max results per page (default 50)" },
			offset: { type: "number", description: "Pagination offset for fetching subsequent pages" },
		},
	),
	defineTool(
		"check_feature_access",
		"Check whether a customer currently has access to a specific feature and how much balance remains. Use this to answer questions like 'can customer X use feature Y?' or 'how many API calls does this customer have left?'.",
		{ customer_id: p.customer_id, feature_id: p.feature_id },
		["customer_id", "feature_id"],
	),
	defineTool(
		"get_usage_aggregate",
		"Get total usage for a customer's feature(s) over a time range. Returns aggregated counts, not individual events. Use this for questions like 'how much has customer X used this month?' or 'what's their usage trend?'. For individual event details, use list_events instead.",
		{
			customer_id: p.customer_id,
			feature_id: {
				type: "string",
				description: "Feature ID, or multiple comma-separated IDs (e.g. 'api-calls,storage')",
			},
			range: {
				type: "string",
				enum: ["24h", "7d", "30d", "90d", "last_cycle"],
				description:
					"Time range to aggregate over. Use 'last_cycle' for current billing period. Default: 30d.",
			},
		},
		["customer_id", "feature_id"],
	),
	defineTool(
		"list_events",
		"List individual usage events for a customer's feature, ordered by most recent. Use this when the user wants to see specific events, audit a usage log, or debug a particular usage record. For totals, use get_usage_aggregate instead.",
		{
			customer_id: p.customer_id,
			feature_id: p.feature_id,
			limit: { type: "number", description: "Max events to return (default 20)" },
		},
		["customer_id", "feature_id"],
	),
	defineTool(
		"list_plans",
		"List all plans configured in Autumn with their features, pricing, and billing intervals. Use this when the user refers to a plan by name (to find the correct plan ID), when comparing plans, or when asked 'what plans are available?'.",
		{},
	),
	defineTool(
		"get_plan",
		"Get full details of a specific plan including all features, pricing tiers, and configuration. Use when the user asks about a particular plan's details after you already know the plan ID.",
		{ plan_id: p.plan_id },
		["plan_id"],
	),
	defineTool(
		"list_features",
		"List all features defined in Autumn. Use this when the user asks about available features, or when you need to find the correct feature ID for a name the user mentioned.",
		{},
	),
	defineTool(
		"get_feature",
		"Get details of a specific feature including its type, metering config, and which plans include it.",
		{ feature_id: p.feature_id },
		["feature_id"],
	),
	defineTool(
		"get_entity",
		"Get an entity (sub-resource like a team member or project) and its individual feature balances. Entities belong to a customer and can have their own usage limits.",
		{
			customer_id: p.customer_id,
			entity_id: { type: "string", description: "The entity ID (e.g. team member ID, project ID)" },
		},
		["customer_id", "entity_id"],
	),
	defineTool(
		"get_billing_portal_url",
		"Generate a Stripe billing portal URL where the customer can manage their payment methods, view/pay invoices, and update billing info. Use this when the user needs to share a self-service link, or when they want to do something you can't do directly (like void an invoice, add a payment method, or issue a refund).",
		{ customer_id: p.customer_id },
		["customer_id"],
	),
];

const billingFlowReadTools = [
	defineTool(
		"preview_attach",
		"Preview cost of attaching a plan to a customer. Always call before attach_plan. Supports customize for custom pricing.",
		{
			customer_id: p.customer_id,
			plan_id: p.plan_id,
			customize: customizeSchema,
		},
		["customer_id", "plan_id"],
	),
];

const billingFlowMutatingTools = [
	defineTool(
		"attach_plan",
		"Subscribe a customer to a plan. Always preview_attach first. Set is_plan_switch=true if upgrading/downgrading. Use customize for custom pricing. See billing_flows skill for details.",
		{
			customer_id: p.customer_id,
			plan_id: p.plan_id,
			is_plan_switch: {
				type: "boolean",
				description:
					"Set to true if the customer already has an active plan (upgrade/downgrade). Determines whether checkout link or direct charge is offered.",
			},
			customize: customizeSchema,
			success_url: {
				type: "string",
				description: "URL to redirect to after the customer completes Stripe checkout",
			},
			invoice_mode: {
				type: "object",
				description:
					"Create an invoice instead of charging the card on file. The 'Draft Invoice' button sets this automatically — do not set it yourself unless the user specifically asks for invoice billing.",
				properties: {
					enabled: { type: "boolean", description: "Enable invoice mode" },
					enable_plan_immediately: {
						type: "boolean",
						description: "If true, activates the plan before the invoice is paid",
					},
					finalize: {
						type: "boolean",
						description:
							"If true, finalizes and sends the invoice immediately. If false (default for Draft Invoice button), keeps it as a draft for manual review in Stripe.",
					},
				},
				required: ["enabled"],
			},
		},
		["customer_id", "plan_id"],
	),
	defineTool(
		"update_subscription",
		"Modify a subscription: change quantities, customize feature limits, or cancel/uncancel. See billing_flows skill for details.",
		{
			customer_id: p.customer_id,
			plan_id: p.plan_id,
			feature_quantities: {
				type: "array",
				items: {
					type: "object",
					properties: {
						feature_id: { type: "string" },
						quantity: { type: "number" },
					},
					required: ["feature_id", "quantity"],
				},
				description:
					"New quantities for seat-based or quantity-based features (e.g. change seats from 5 to 10)",
			},
			cancel_action: {
				type: "string",
				enum: ["cancel_immediately", "cancel_end_of_cycle", "uncancel"],
				description:
					"cancel_end_of_cycle = cancel at period end (recommended default), cancel_immediately = revoke access now, uncancel = reverse a pending cancellation",
			},
			customize: customizeSchema,
		},
		["customer_id", "plan_id"],
	),
];

const customPlanTools = [
	defineTool(
		"create_plan",
		"Create a new plan. Call list_features first. Features auto-create if feature_type is set. See custom_plans skill for patterns.",
		{
			plan_id: {
				type: "string",
				description:
					"Unique plan ID, lowercase with hyphens (e.g. 'pro-monthly', 'enterprise-annual').",
			},
			name: { type: "string", description: "Display name (e.g. 'Pro Plan', 'Enterprise Annual')." },
			group: {
				type: "string",
				description:
					"Plans in the same group are mutually exclusive (attaching one replaces the other). E.g. 'main' for base plans.",
			},
			description: { type: "string", description: "Optional plan description." },
			add_on: {
				type: "boolean",
				description:
					"If true, this plan can be purchased alongside other plans (e.g. credit packs, premium features). Default false.",
			},
			auto_enable: {
				type: "boolean",
				description:
					"If true, auto-attached when a customer is created. Use only for free tiers. Default false.",
			},
			price: basePriceSchema,
			items: {
				type: "array",
				items: planItemSchema,
				description:
					"Feature configurations. Each item defines what the customer gets and how overage is priced.",
			},
			free_trial: freeTrialSchema,
		},
		["plan_id", "name"],
	),
	defineTool(
		"update_plan",
		"Update a plan. Creates a new version (existing customers are grandfathered). Call get_plan first. See custom_plans skill for details.",
		{
			plan_id: p.plan_id,
			name: { type: "string", description: "New display name." },
			description: { type: "string", description: "New description." },
			group: { type: "string", description: "New group." },
			add_on: { type: "boolean", description: "Whether this is an add-on plan." },
			auto_enable: { type: "boolean", description: "Whether to auto-attach on customer creation." },
			archived: {
				type: "boolean",
				description: "Set true to archive the plan (cannot be attached to new customers).",
			},
			price: {
				...basePriceSchema,
				description: "New base price. Pass null to remove the base price.",
			},
			items: {
				type: "array",
				items: planItemSchema,
				description: "New feature configurations. Replaces all existing items.",
			},
			free_trial: {
				...freeTrialSchema,
				description: "New trial config. Pass null to remove the trial.",
			},
		},
		["plan_id"],
	),
];

const baseMutatingTools = [
	defineTool(
		"create_customer",
		"Create a new customer in Autumn. Use when the user explicitly asks to create/add a customer. Email is required; name is optional but recommended.",
		{
			name: { type: "string", description: "Customer display name" },
			email: {
				type: "string",
				description: "Customer email address (required)",
			},
			id: {
				type: "string",
				description:
					"Custom customer ID. Only set this if the user explicitly provides an ID. Otherwise omit and the system will assign one.",
			},
		},
		["email"],
	),
	defineTool(
		"create_balance",
		"Grant additional balance to a customer's feature. This ADDS to any existing balance — it does not replace it. Use for giving bonus credits, promotional allowances, or one-time grants. To set an exact balance, use set_balance instead.",
		{
			customer_id: p.customer_id,
			feature_id: p.feature_id,
			amount: { type: "number", description: "Amount to add to the balance" },
			unlimited: {
				type: "boolean",
				description: "If true, grants unlimited access to this feature (ignores amount)",
			},
		},
		["customer_id", "feature_id"],
	),
	defineTool(
		"set_balance",
		"Set a customer's feature balance to an exact value, replacing whatever it was before. Use when the user says 'set balance to X' or 'reset balance to X'. To add credits on top of existing balance, use create_balance instead.",
		{
			customer_id: p.customer_id,
			feature_id: p.feature_id,
			balance: {
				type: "number",
				description: "The exact balance value to set (replaces current balance)",
			},
		},
		["customer_id", "feature_id", "balance"],
	),
	defineTool(
		"track_usage",
		"Record a usage event for a customer's feature. Positive values consume balance (e.g. customer used 5 API calls), negative values credit back (e.g. undo a charge, grant a refund of usage). Each call creates one event record.",
		{
			customer_id: p.customer_id,
			feature_id: p.feature_id,
			value: {
				type: "number",
				description:
					"Positive = consume balance, negative = credit back. E.g. 5 to deduct 5 units, -3 to refund 3 units.",
			},
		},
		["customer_id", "feature_id", "value"],
	),
	defineTool(
		"generate_checkout_url",
		"Generate a standalone Stripe checkout URL for a customer and plan. Use this when you only need a checkout link without the full attach_plan flow (e.g. the user just wants a link to share). The customer does not need a payment method on file — they enter it during checkout.",
		{ customer_id: p.customer_id, plan_id: p.plan_id },
		["customer_id", "plan_id"],
	),
	defineTool(
		"setup_payment",
		"Generate a Stripe payment method setup link. The customer visits this URL to add or update their card/payment method. Use when a customer needs to add payment info before being charged, or when they want to update an expired card.",
		{ customer_id: p.customer_id },
		["customer_id"],
	),
	defineTool(
		"update_customer",
		"Update a customer's name or email address. At least one field must be provided. Use when the user asks to rename a customer, fix a typo in their email, or update contact info.",
		{
			customer_id: p.customer_id,
			name: { type: "string", description: "New display name" },
			email: { type: "string", description: "New email address" },
		},
		["customer_id"],
	),
	defineTool(
		"create_referral_code",
		"Create a referral code that this customer can share with others. The code is tied to a specific referral program. When someone redeems it, both parties get the rewards defined in the program.",
		{
			customer_id: p.customer_id,
			program_id: {
				type: "string",
				description: "The referral program ID that defines the rewards",
			},
		},
		["customer_id", "program_id"],
	),
	defineTool(
		"redeem_referral_code",
		"Apply a referral code for a customer, giving them (and the referrer) the rewards defined in the referral program.",
		{
			code: { type: "string", description: "The referral code to redeem" },
			customer_id: p.customer_id,
		},
		["code", "customer_id"],
	),
];

const allMutating = [...baseMutatingTools, ...billingFlowMutatingTools, ...customPlanTools];

export const MUTATING_TOOLS = new Set(allMutating.map((t) => t.name));

export function getTools(skills: Set<string>): Anthropic.Tool[] {
	const tools: Anthropic.Tool[] = [...baseReadTools, ...baseMutatingTools];
	if (skills.has("billing_flows")) tools.push(...billingFlowReadTools, ...billingFlowMutatingTools);
	if (skills.has("custom_plans")) tools.push(...customPlanTools);
	return tools;
}
