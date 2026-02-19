import { ExtCheckParamsSchema, TrackParamsSchema } from "@autumn/shared";
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
		"Whether access is allowed, plus the current balance for that feature.",
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
		"The usage value recorded, with either a single updated balance or a map of updated balances.",
});
