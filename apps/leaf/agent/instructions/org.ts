import { defineDynamic, defineInstructions } from "eve/instructions";

export default defineDynamic({
	events: {
		"session.started": (_event, ctx) => {
			const instructions = ctx.session.auth.current?.attributes.orgInstructions;
			if (typeof instructions !== "string" || !instructions.trim()) return null;

			return defineInstructions({
				markdown: `## Custom organization instructions\n\nThe following instructions were configured for this organization:\n\n${instructions}`,
			});
		},
	},
});
