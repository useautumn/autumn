/** The Autumn MCP write tools nest their payload under `request`; a few call
 * shapes pass the fields flat, so both have to be accepted. */
export const toolRequestFromArgs = (
	args?: Record<string, unknown>,
): Record<string, unknown> | undefined =>
	args?.request && typeof args.request === "object"
		? (args.request as Record<string, unknown>)
		: args;

/** Drops the `_eve*` option ids the harness threads through `toolArgs` — they
 * are transport, not part of the write the user is approving. */
export const publicToolArgs = (args: Record<string, unknown>) =>
	Object.fromEntries(
		Object.entries(args).filter(([key]) => !key.startsWith("_eve")),
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

/** Whether two tool calls carry the same payload, ignoring key order — the
 * model emits its JSON arguments in whatever order it likes. Both payloads are
 * required: an absent one is unknown, not equal to another absent one. */
export const isSameToolRequest = (
	left: Record<string, unknown>,
	right: Record<string, unknown>,
) => canonicalJson(left) === canonicalJson(right);
