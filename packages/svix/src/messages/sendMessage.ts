import type { Svix } from "svix";
import type { SvixMessage } from "../types/svixClient.js";

/** The payload every Autumn webhook has: its type beside its data, so a receiver can route on it. */
export const sendMessage = async ({
	ctx,
	appId,
	message,
}: {
	ctx: { svix: Svix };
	appId: string;
	message: SvixMessage;
}): Promise<void> => {
	const { eventType, data, tags, idempotencyKey, payloadFields } = message;
	await ctx.svix.message.create(
		appId,
		{
			eventType,
			payload: { type: eventType, ...payloadFields, data },
			...(tags && tags.length > 0 ? { tags } : {}),
		},
		idempotencyKey ? { idempotencyKey } : undefined,
	);
};
