import { z } from "zod/v4";
import type { CheckReply, CheckRequest } from "../../processor/types/check.js";

/** `POST /v1/balances.check` as the customer's app sends it. Not strict: a field Atom does not read is ignored, never refused. */
const checkBodySchema = z.object({
	customer_id: z.string().min(1),
	feature_id: z.string().min(1),
	required_balance: z.number().default(1),
	properties: z.record(z.string(), z.json()).nullable().default(null),
});

export const checkBodyToRequest = ({
	body,
	requestId,
	occurredAt,
}: {
	body: unknown;
	requestId: string;
	occurredAt: number;
}): CheckRequest => {
	const parsed = checkBodySchema.parse(body);
	return {
		requestId,
		customerId: parsed.customer_id,
		featureId: parsed.feature_id,
		requiredBalance: parsed.required_balance,
		properties: parsed.properties,
		occurredAt,
	};
};

export const checkReplyToBody = ({ reply }: { reply: CheckReply }) =>
	"askApi" in reply ? { ask_api: reply.askApi } : { allowed: reply.allowed };
