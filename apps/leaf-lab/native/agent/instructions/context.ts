import { defineDynamic, defineInstructions } from "eve/instructions";
import { type NativeContext, nativeBridgeRequest } from "../../lib/protocol.js";

export default defineDynamic({
	events: {
		"turn.started": async (_event, ctx) => {
			const context = await nativeBridgeRequest<NativeContext>("/context", {
				sessionId: ctx.session.id,
				messages: ctx.messages,
			});
			return defineInstructions({ content: context.content });
		},
	},
});
