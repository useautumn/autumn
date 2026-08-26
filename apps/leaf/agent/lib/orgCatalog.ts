import { defineDynamic, defineInstructions } from "eve/instructions";

/** The org's plans and features ride the same session auth attributes as
 * `orgInstructions`. Only subagents render it: the top-level agent already
 * receives the same blocks inline in its first message. */
export const orgCatalog = () =>
	defineDynamic({
		events: {
			"session.started": (_event, ctx) => {
				const catalog = ctx.session.auth.current?.attributes.orgCatalog;
				if (typeof catalog !== "string" || !catalog.trim()) return null;
				return defineInstructions({
					markdown: `## Org catalog\n\nAlready-run tool results for this org — treat them as current state and do NOT re-call these tools:\n\n${catalog}`,
				});
			},
		},
	});
