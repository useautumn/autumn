import { Client } from "eve/client";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { nativeBridgeRequest } from "../../lib/protocol.js";

export default defineTool({
	description:
		"Cancel an existing pending approval before preparing a concretely changed replacement requested by the user. Pass the old call ID from the pending-proposal context. Do not use for a question, an explanation, or an unchanged repeated request. This cancels only an unexecuted approval; it never reverses applied billing.",
	inputSchema: z.object({ call_id: z.string(), reason: z.string() }),
	execute: async (args, ctx) => {
		const host = process.env.LEAF_NATIVE_HOST_URL;
		if (!host || new URL(host).hostname !== "127.0.0.1")
			throw new Error(
				"Native approval supersession requires the local Eve host",
			);
		const { requestId } = await nativeBridgeRequest<{ requestId: string }>(
			"/supersede",
			{ sessionId: ctx.session.id, ...args },
		);
		await new Client({ host }).sessions
			.attach(ctx.session.id)
			.respond([{ requestId, optionId: "cancel" }]);
		return {
			status: "cancellation_submitted",
			request_id: requestId,
			message:
				"Cancellation of the old approval was submitted through Eve. No billing write executed. Continue with the user's requested replacement after the cancellation resolves.",
		};
	},
});
