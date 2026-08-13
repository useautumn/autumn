/** The request body the approver is deciding on, unwrapped from tool wrapper
 * fields like the agent's `intent` note. Falls back to `args` itself, so a
 * defined input always yields a defined body. */
export function getRequest(
	args: Record<string, unknown>,
): Record<string, unknown>;
export function getRequest(
	args?: Record<string, unknown>,
): Record<string, unknown> | undefined;
export function getRequest(args?: Record<string, unknown>) {
	return args?.request && typeof args.request === "object"
		? (args.request as Record<string, unknown>)
		: args;
}

/** Eve's option ids ride in the stored args; they are wiring, not something an
 * approver should read. */
export const publicToolArgs = (args: Record<string, unknown>) =>
	Object.fromEntries(
		Object.entries(args).filter(([key]) => !key.startsWith("_eve")),
	);
