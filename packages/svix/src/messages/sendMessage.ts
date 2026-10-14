import type { Svix } from "svix";
import type { SvixMessage } from "../types/svixClient.js";

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
