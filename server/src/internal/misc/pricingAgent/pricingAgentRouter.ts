import { createAnthropic } from "@ai-sdk/anthropic";
import { type AgentPricingConfig, InternalError } from "@autumn/shared";
import { withTracing } from "@posthog/ai";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { Hono } from "hono";
import { PostHog } from "posthog-node";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleSetupPreviewOrg } from "./handlers/handleSetupPreviewOrg.js";
import { handleSyncPreviewPricing } from "./handlers/handleSyncPreviewPricing.js";
import { OrganisationConfigurationSchema } from "./pricingAgentSchemas.js";

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

4. **Prepaid Credit Purchase** (one-time or recurring):
   \`{ feature_id: "credits", price: 10, usage_model: "prepaid", billing_units: 10000 } \`,
   → Customer pays $10 for 10,000 credits. Add \`interval: "month" \` to make it a recurring subscription with selectable quantity.


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
	const {
		messages,
		sessionId,
		initialConfig,
	}: {
		messages: UIMessage[];
		sessionId?: string;
		initialConfig?: AgentPricingConfig | null;
	} = await c.req.json();
	const ctx = c.var.ctx;

	if (!process.env.ANTHROPIC_API_KEY) {
		throw new InternalError({
			message: "ANTHROPIC_API_KEY not configured",
			code: "anthropic_not_configured",
		});
	}

	// Build system prompt, optionally including initial config context
	let systemPrompt = SYSTEM_PROMPT;
	if (
		initialConfig &&
		(initialConfig.products.length > 0 || initialConfig.features.length > 0)
	) {
		systemPrompt += `

## Current Pricing Configuration

The user has an existing pricing setup that they want to modify. Here is their current configuration:

\`\`\`json
${JSON.stringify(initialConfig, null, 2)}
\`\`\`

When the user asks to make changes, modify this existing configuration rather than starting from scratch. Build upon what they already have unless they explicitly ask to start fresh.`;
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
		system: systemPrompt,
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
