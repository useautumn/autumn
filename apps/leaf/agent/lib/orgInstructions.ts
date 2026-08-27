import { defineDynamic, defineInstructions } from "eve/instructions";

/** Session auth attributes, which eve copies verbatim to child runs, so
 * specialists render the same org context the top-level agent gets. */
const fromSessionAttribute = ({
	attribute,
	heading,
	preamble,
}: {
	attribute: "orgCatalog" | "orgInstructions";
	heading: string;
	preamble: string;
}) =>
	defineDynamic({
		events: {
			"session.started": (_event, ctx) => {
				const value = ctx.session.auth.current?.attributes[attribute];
				if (typeof value !== "string" || !value.trim()) return null;
				return defineInstructions({
					markdown: `## ${heading}\n\n${preamble}\n\n${value}`,
				});
			},
		},
	});

export const orgInstructions = () =>
	fromSessionAttribute({
		attribute: "orgInstructions",
		heading: "Custom organization instructions",
		preamble:
			"The following instructions were configured for this organization and MUST be followed:",
	});

/** Subagents only — the top-level agent gets these blocks inline instead. */
export const orgCatalog = () =>
	fromSessionAttribute({
		attribute: "orgCatalog",
		heading: "Org catalog",
		preamble:
			"Already-run tool results for this org — treat them as current state and do NOT re-call these tools:",
	});
