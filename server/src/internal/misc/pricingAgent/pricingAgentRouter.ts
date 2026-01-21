import { createAnthropic } from "@ai-sdk/anthropic";
import { InternalError } from "@autumn/shared";
import { withTracing } from "@posthog/ai";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { Hono } from "hono";
import { PostHog } from "posthog-node";
import { z } from "zod/v4";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleSetupPreviewOrg } from "./handlers/handleSetupPreviewOrg.js";
import { handleSyncPreviewPricing } from "./handlers/handleSyncPreviewPricing.js";

// PostHog client singleton
let phClient: PostHog | null = null;
const getPostHogClient = (): PostHog | null => {
	if (!process.env.POSTHOG_API_KEY) {
		return null;
	}
	if (!phClient) {
		phClient = new PostHog(process.env.POSTHOG_API_KEY, {
			host: process.env.POSTHOG_HOST || "https://us.i.posthog.com",
		});
	}
	return phClient;
};

// ============ SCHEMAS ============
const ApiFeatureType = z.enum([
	"static",
	"boolean",
	"single_use",
	"continuous_use",
	"credit_system",
]);

const ProductItemInterval = z.enum([
	"minute",
	"hour",
	"day",
	"week",
	"month",
	"quarter",
	"semi_annual",
	"year",
]);

const UsageModel = z.enum(["prepaid", "pay_per_use"]);
const FreeTrialDuration = z.enum(["day", "month", "year"]);

const FeatureSchema = z
	.object({
		id: z
			.string()
			.describe(
				"Unique ID for the feature (lowercase, underscores, no spaces)",
			),
		name: z.string().describe("Display name for the feature"),
		type: ApiFeatureType.describe(
			"Type: single_use for consumables, continuous_use for allocated resources, boolean for on/off",
		),
		display: z
			.object({
				singular: z
					.string()
					.describe(
						"Singular form of the unit (e.g., 'message', 'credit', 'seat', 'API call')",
					),
				plural: z
					.string()
					.describe(
						"Plural form of the unit (e.g., 'messages', 'credits', 'seats', 'API calls')",
					),
			})
			.describe(
				"REQUIRED for metered features (single_use, continuous_use, credit_system). Used for display like '100 messages' or '1 seat'.",
			),
		credit_schema: z
			.array(
				z.object({
					metered_feature_id: z.string(),
					credit_cost: z.number(),
				}),
			)
			.nullish(),
	})
	.refine(
		(data) => {
			if (data.type === "credit_system") {
				return data.credit_schema && data.credit_schema.length > 0;
			}
			return true;
		},
		{
			message:
				"Credit system features require at least one metered feature in credit_schema.",
			path: ["credit_schema"],
		},
	);

const PriceTierSchema = z.object({
	to: z
		.number()
		.or(z.literal("inf"))
		.describe("The upper limit of this tier (use 'inf' for unlimited)"),
	amount: z.number().describe("The price per unit for this tier"),
});

const ProductItemSchema = z.object({
	feature_id: z
		.string()
		.nullish()
		.describe(
			"Feature ID this item relates to. Set to null for standalone flat-fee price items (e.g., subscription base price, one-time purchase price).",
		),
	included_usage: z
		.number()
		.or(z.literal("inf"))
		.nullish()
		.describe(
			"Usage granted to the customer. Use WITHOUT price for free allocations. Use WITH usage_model and price for metered pricing.",
		),
	interval: ProductItemInterval.nullish().describe("Reset/billing interval"),
	price: z
		.number()
		.nullish()
		.describe(
			"Price amount. When feature_id is null, this is a standalone flat fee. When feature_id is set with usage_model, this is the per-unit price.",
		),
	tiers: z
		.array(PriceTierSchema)
		.nullish()
		.describe(
			"Tiered pricing structure. Use instead of price for volume-based pricing. Each tier defines upper limit (to) and price per unit (amount).",
		),
	usage_model: UsageModel.nullish().describe(
		"prepaid or pay_per_use. Required when pricing per unit of usage.",
	),
	billing_units: z
		.number()
		.nullish()
		.describe("Units per price (e.g., $1 per 30 credits)"),
});

const FreeTrialSchema = z
	.object({
		length: z.number().describe("Length of free trial"),
		duration: FreeTrialDuration.describe("Unit: day, month, or year"),
		unique_fingerprint: z.boolean().default(false),
		card_required: z.boolean().default(true),
	})
	.nullish();

const ProductSchema = z
	.object({
		id: z.string().describe("Unique ID (lowercase, hyphens allowed)"),
		name: z.string().describe("Display name"),
		is_add_on: z
			.boolean()
			.default(false)
			.describe(
				"Set to true if this product is an add-on or top-up, (can be purchased together with other base plans).",
			),
		is_default: z
			.boolean()
			.default(false)
			.describe(
				"Set to true ONLY if the items array is completely empty OR contains only items with price: null. ANY pricing items (including pay-per-use, overage charges, prepaid etc.) disqualifies a plan from being default.",
			),
		group: z
			.string()
			.default("")
			.describe(
				"A group to assign this plan to. Leave empty unless user is building pricing where a customer could subscribe to 2 or more types of plans at the same time.`",
			),
		items: z.array(ProductItemSchema).default([]),
		free_trial: FreeTrialSchema,
	})
	.refine(
		(data) => {
			if (data.is_default) {
				return data.items.every((item) => item.price == null);
			}
			return true;
		},
		{
			message:
				"Default plans cannot have priced items. All items must have price: null or undefined.",
			path: ["is_default"],
		},
	)
	.refine(
		(data) => {
			const usageBasedFeatureIds = new Set(
				data.items
					.filter((item) => item.feature_id != null && item.usage_model != null)
					.map((item) => item.feature_id),
			);
			// Check if any other items reference the same feature_id
			return !data.items.some(
				(item) =>
					item.feature_id != null &&
					item.usage_model == null &&
					usageBasedFeatureIds.has(item.feature_id),
			);
		},
		{
			message:
				"Cannot have separate items for the same feature when one has usage-based pricing. Combine into a single item (e.g., 100 free, then $0.10 per additional).",
			path: ["items"],
		},
	)
	.refine(
		(data) => {
			return !data.items.some(
				(item) => item.usage_model === "pay_per_use" && item.interval == null,
			);
		},
		{
			message:
				"Pay-per-use pricing requires an interval. Set interval (e.g., 'month') for usage-based items.",
			path: ["items"],
		},
	)
	.refine(
		(data) => {
			return !data.items.some(
				(item) =>
					item.price != null &&
					item.feature_id != null &&
					item.usage_model == null,
			);
		},
		{
			message:
				"Priced metered features require a usage_model. Set to 'pay_per_use' or 'prepaid'.",
			path: ["items"],
		},
	);

const OrganisationConfigurationSchema = z.object({
	features: z.array(FeatureSchema).default([]),
	products: z.array(ProductSchema),
});

export type PricingConfig = z.infer<typeof OrganisationConfigurationSchema>;

// ============ SYSTEM PROMPT ============
const SYSTEM_PROMPT = `You are a helpful pricing configuration assistant for Autumn, a billing and entitlements platform.

Your job is to help users set up their pricing model through natural conversation. You should:
1. Ask clarifying questions to understand their needs
2. Generate and update the pricing configuration as you learn more
3. Read through these instructions carefully for every single message, and follow them exactly.

**IMPORTANT**: Call the build_pricing tool EVERY time the user provides any information at all about their pricing, features, or products. This updates the live preview they see. Even partial information should trigger a tool call with your best interpretation.


## Feature Types
- **single_use**: Consumable resources (API calls, tokens, messages, credits, generations)
- **continuous_use**: Non-consumable resources (seats, workspaces, projects, team members)
- **boolean**: On/off features (advanced analytics, priority support, SSO)
- **credit_system**: A unified credit pool that maps to multiple single_use features



## Item Types
Products contain an array of items. There are THREE distinct item patterns:

1. **Flat Fee** (standalone price, no feature):
   \`{ feature_id: null, price: 13, interval: "month" }\`
   → Customer pays $13/month as a base subscription fee

2. **Free Feature Allocation** (feature grant, no price):
   \`{ feature_id: "credits", included_usage: 10000 }\`
   → Customer gets 10,000 credits included

3. **Metered/Usage-Based Pricing**:
   \`{ feature_id: "credits", included_usage: 10000, price: 0.01, usage_model: "pay_per_use", interval: "month" }\`
   → Customer can use 10,000 credits per month, and then pays $0.01 per credit used after that.

4. **Prepaid Credit Purchase** (one-time purchase of usage):
   \`{ feature_id: "credits", price: 10, usage_model: "prepaid", billing_units: 10000 }\`
   → Customer pays $10 once to receive 10,000 credits

5. **Tiered Pricing**:
   \`{ feature_id: "api_calls", included_usage: 1000, tiers: [{ to: 5000, amount: 0.02 }, { to: "inf", amount: 0.01 }], usage_model: "pay_per_use", interval: "month" }\`
   → Customer gets 1,000 API calls free, then pays $0.02/call up to 5,000, then $0.01/call after that.

6. **Per-Unit Pricing Structure**:
For any "per-X" pricing (like "$Y per seat", "$Y per project", "$Y per website"), ALWAYS use this pattern:
- Base subscription fee: \`{ feature_id: null, price: 10, interval: "month" }\`
- Unit allocation: \`{ feature_id: "seats", included_usage: 1, price: 10, usage_model: "pay_per_use", billing_units: 1 }\`
This creates: $Y/month base price that includes 1 unit, then $Y per additional unit purchased.
**ALWAYS** use this two-item pattern for any per-unit pricing - never use pure per-unit without a base fee.




## Guidelines when building the config

- Refer to the Item Types section above to see examples of how to build the config.

- **Features vs Items**: Features define WHAT can be tracked (e.g., "credits"). Items define HOW that feature is granted in a product (recurring, one-time, free, paid). NEVER create duplicate features for the same underlying resource. For example, "monthly tokens" and "one-time tokens" should be the SAME feature ("tokens"), referenced by different items and intervals.

- If you identify more than 3 features from user input, build the 3 most important (prioritizing metered features) and ask the user to confirm if they want to add more. Inform them clearly that you kept it simple to start with, but they can add more later.

- Product and Feature IDs should be lowercase with underscores (e.g., "pro_plan", "chat_messages")

- **NEVER** allow is_default: true for plans with prices. All prices MUST be null or undefined.

- Ignore reference to "Enterprise" plans with custom pricing. They do not need to be generated here. Instead, inform the user that custom plans can be created for any customer within the Autumn dashboard.

- For annual variants of plans, create another separate plan but with the annual price interval. Name it <plan_name> - Annual




## Guidelines when responding to the user

- Do NOT tell the user what pricing you have built or describe the pricing in any way, as it is a waste to read (they can see it on the right).

- If the user asks about changing currency, let them know they can do so in the Autumn dashboard, under Developer > Stripe.

- If the user has a price for a feature, ask them whether it should be a usage-based (pay_per_use) or prepaid (prepaid) pricing

- If the user asks about pricing or functionality that you are not sure whether is possible, DO NOT make up information or assume it can be done. They can reach us on discord here: https://discord.gg/atmn (we're very responsive)

- Keep responses very concise and friendly.`;

// ============ HONO ROUTER ============
export const pricingAgentRouter = new Hono<HonoEnv>();

pricingAgentRouter.post("/chat", async (c) => {
	const { messages, sessionId }: { messages: UIMessage[]; sessionId?: string } =
		await c.req.json();
	const ctx = c.var.ctx;

	if (!process.env.ANTHROPIC_API_KEY) {
		throw new InternalError({
			message: "ANTHROPIC_API_KEY not configured",
			code: "anthropic_not_configured",
		});
	}

	// Create Anthropic client and optionally wrap with PostHog tracing
	const anthropicClient = createAnthropic({
		apiKey: process.env.ANTHROPIC_API_KEY,
	});
	const baseModel = anthropicClient("claude-opus-4-5");

	const posthog = getPostHogClient();
	const distinctId = ctx.userId || ctx.org?.id || "anonymous";

	const model = posthog
		? withTracing(baseModel, posthog, {
				posthogDistinctId: distinctId,
				posthogProperties: {
					...(sessionId && { $ai_session_id: sessionId }),
					...(ctx.user?.email && { $set: { email: ctx.user.email } }),
					org_id: ctx.org?.id,
					org_slug: ctx.org?.slug,
					feature: "pricing_agent",
				},
			})
		: baseModel;

	const result = streamText({
		model,
		system: SYSTEM_PROMPT,
		messages: await convertToModelMessages(messages),
		tools: {
			build_pricing: {
				description:
					"Generate the pricing configuration based on the conversation. Call this whenever you have new information about the user's pricing needs, even if partial. This updates their live preview.",
				inputSchema: OrganisationConfigurationSchema,
			},
		},
		onFinish: async () => {
			if (posthog) {
				await posthog.flush();
			}
		},
	});

	return result.toUIMessageStreamResponse();
});

// ============ PREVIEW ROUTES ============
/**
 * POST /preview/setup
 * Creates or retrieves a persistent preview sandbox org for the current user
 */
pricingAgentRouter.post("/preview/setup", ...handleSetupPreviewOrg);

/**
 * POST /preview/sync
 * Syncs pricing configuration to the preview sandbox org
 */
pricingAgentRouter.post("/preview/sync", ...handleSyncPreviewPricing);
