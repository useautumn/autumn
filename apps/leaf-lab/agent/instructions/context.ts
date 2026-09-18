import { defineDynamic, defineInstructions } from "eve/instructions";
import { bridgeRequest } from "../../lib/bridgeClient.js";

export default defineDynamic({
	events: {
		"turn.started": async (_event, ctx) => {
			const markdown = await bridgeRequest<string>("/prepare", {
				messages: ctx.messages,
			});
			return defineInstructions({ markdown });
		},
	},
});
