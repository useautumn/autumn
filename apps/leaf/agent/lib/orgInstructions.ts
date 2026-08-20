import { defineDynamic, defineInstructions } from "eve/instructions";

/** Org-level policy (agent rules `notes`) rides the session auth attributes,
 * which eve copies verbatim to child runs — every agent must render it, or
 * specialists execute without the org's standing instructions. Session-scoped
 * keeps the prompt cache stable. */
export const orgInstructions = () =>
	defineDynamic({
		events: {
			"session.started": (_event, ctx) => {
				const instructions =
					ctx.session.auth.current?.attributes.orgInstructions;
				if (typeof instructions !== "string" || !instructions.trim()) {
					return null;
				}
				return defineInstructions({
					markdown: `## Custom organization instructions\n\nThe following instructions were configured for this organization and MUST be followed:\n\n${instructions}`,
				});
			},
		},
	});
