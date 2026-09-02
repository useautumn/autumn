import { defineDynamic, defineInstructions } from "eve/instructions";

const fromSessionAttribute = ({
	attribute,
	heading,
	preamble,
}: {
	attribute: "orgInstructions";
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
