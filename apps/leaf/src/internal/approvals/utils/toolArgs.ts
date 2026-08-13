/** The request body the approver is deciding on, unwrapped from tool wrapper
 * fields like the agent's `intent` note. */
export const getRequest = (args?: Record<string, unknown>) =>
	args?.request && typeof args.request === "object"
		? (args.request as Record<string, unknown>)
		: args;

/** Eve's option ids ride in the stored args; they are wiring, not something an
 * approver should read. */
export const publicToolArgs = (args: Record<string, unknown>) =>
	Object.fromEntries(
		Object.entries(args).filter(([key]) => !key.startsWith("_eve")),
	);
