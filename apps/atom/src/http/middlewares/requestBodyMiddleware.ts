import type { Context, Next } from "hono";
import { PUSH_PATHS } from "../../init/processStats.js";
import { pushPhaseMs } from "../../pushes/pushPhaseMs.js";
import type { AtomHttpEnv } from "../types/atomHttp.js";

/** Reads the body once for every layer after it. Text, not JSON: the raw text stays cached for a forward. */
export async function requestBodyMiddleware(
	context: Context<AtomHttpEnv>,
	next: Next,
): Promise<void> {
	const text = await context.req.text();
	const parseStartedAt = performance.now();
	context.set("body", parseJson(text));
	if (PUSH_PATHS.has(context.req.path))
		pushPhaseMs.parse += performance.now() - parseStartedAt;
	await next();
}

/** A body that is not JSON is read as none; whichever route it came to decides what that means. */
const parseJson = (text: string): unknown => {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
};
