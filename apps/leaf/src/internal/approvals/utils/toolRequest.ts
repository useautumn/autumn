import { WITHHELD_WRITES_KEY } from "../../agentRuntime/eve/parkedInput.js";

/** The Autumn MCP write tools nest their payload under `request`; a few call
 * shapes pass the fields flat, so both have to be accepted. */
export const toolRequestFromArgs = (
	args?: Record<string, unknown>,
): Record<string, unknown> | undefined =>
	args?.request && typeof args.request === "object"
		? (args.request as Record<string, unknown>)
		: args;

/** A string field from the tool call's request payload (nested or flat). */
export const requestStringField = (
	toolArgs: Record<string, unknown> | undefined,
	key: string,
): string | undefined => {
	const value = toolRequestFromArgs(toolArgs)?.[key];
	return typeof value === "string" ? value : undefined;
};

/** Strips harness transport (option/request ids) before display; legacy rows
 * keep the grouped-writes marker their cards still render from. */
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

/** Payload equality ignoring key order; an absent payload is unknown, never
 * equal to another absent one. */
export const isSameToolRequest = (
	left: Record<string, unknown>,
	right: Record<string, unknown>,
) => canonicalJson(left) === canonicalJson(right);
