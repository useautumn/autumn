import { WITHHELD_WRITES_KEY } from "../../agentRuntime/eve/parkedInput.js";

export const toolRequestFromArgs = (
	args?: Record<string, unknown>,
): Record<string, unknown> | undefined =>
	args?.request && typeof args.request === "object"
		? (args.request as Record<string, unknown>)
		: args;

export const requestStringField = (
	toolArgs: Record<string, unknown> | undefined,
	key: string,
): string | undefined => {
	const value = toolRequestFromArgs(toolArgs)?.[key];
	return typeof value === "string" ? value : undefined;
};

export const publicToolArgs = (
	args: Record<string, unknown>,
	{ includeWithheld = true }: { includeWithheld?: boolean } = {},
) =>
	Object.fromEntries(
		Object.entries(args).filter(
			([key]) =>
				!key.startsWith("_eve") ||
				(includeWithheld && key === WITHHELD_WRITES_KEY),
		),
	);

const canonicalJson = (value: unknown) =>
	JSON.stringify(value, (_key, nested: unknown) =>
		nested && typeof nested === "object" && !Array.isArray(nested)
			? Object.fromEntries(
					Object.entries(nested as Record<string, unknown>).sort(
						([left], [right]) => left.localeCompare(right),
					),
				)
			: nested,
	);

export const isSameToolRequest = (
	left: Record<string, unknown>,
	right: Record<string, unknown>,
) => canonicalJson(left) === canonicalJson(right);
