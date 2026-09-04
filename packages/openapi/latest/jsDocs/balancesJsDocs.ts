import {
	ExtCheckParamsSchema,
	TrackParamsSchema,
	TrackTokensParamsSchema,
} from "@autumn/shared";
import { createJSDocDescription, example } from "../../utils/jsDocs/index.js";

export const balancesCheckJsDoc = createJSDocDescription({
	description:
		"Checks whether a customer currently has enough balance to use a feature.",
	whenToUse:
		"Use this to gate access before a feature action. Enable sendEvent when you want to check and consume balance atomically in one request.",
	body: ExtCheckParamsSchema,
	examples: [
		example({
			description: "Check access for a feature",
			values: {
				customerId: "cus_123",
				featureId: "messages",
			},
		}),
		example({
			description: "Check and consume 3 units in one call",
			values: {
				customerId: "cus_123",
				featureId: "messages",
				requiredBalance: 3,
				sendEvent: true,
			},
		}),
	],
	methodName: "check",
	returns:
		"Whether access is allowed, plus the current balance for that feature. If Autumn is experiencing degraded service from a downstream provider, the API may return 202 and allow access fail-open.",
});

export const balancesTrackJsDoc = createJSDocDescription({
	description:
		"Records usage for a customer feature and returns updated balances.",
	whenToUse:
		"Use this after an action happens to decrement usage, or send a negative value to credit balance back.",
	body: TrackParamsSchema,
	examples: [
		example({
			description: "Track one message event",
			values: {
				customerId: "cus_123",
				featureId: "messages",
				value: 1,
			},
		}),
		example({
			description: "Track an event mapped to multiple features",
			values: {
				customerId: "cus_123",
				eventName: "ai_chat_request",
				value: 1,
			},
		}),
	],
	methodName: "track",
	returns:
		"The usage value recorded, with either a single updated balance or a map of updated balances. If Autumn is experiencing degraded service from a downstream provider, the API may return 202 after accepting the event for replay so it can be tracked as soon as the service is restored.",
});

export const balancesTrackTokensJsDoc = createJSDocDescription({
	description:
		"Records AI token usage for a customer and returns the updated AI credit balance.",
	whenToUse:
		"Use this after an LLM request when you have input and output token counts. Autumn converts token usage to a dollar amount using the configured model pricing and markup, then tracks that value against the customer's AI credit system.",
	body: TrackTokensParamsSchema,
	examples: [
		example({
			description: "Track one LLM response",
			values: {
				customerId: "cus_123",
				featureId: "ai_credits",
				modelId: "anthropic/claude-sonnet-4-20250514",
				inputTokens: 1000,
				outputTokens: 500,
			},
		}),
	],
	methodName: "trackTokens",
	returns:
		"The dollar value recorded and the updated AI credit system balance. If Autumn is experiencing degraded service from a downstream provider, the API may return 202 after accepting the token usage event for replay so it can be tracked as soon as the service is restored.",
});
