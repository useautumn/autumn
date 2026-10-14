import type { Context, Next } from "hono";
import type { AtomHttpEnv } from "../types/atomHttp.js";

const SUBJECT_PUSH_PATH = "/v1/subjects.set";

export async function requestBodyMiddleware(
	context: Context<AtomHttpEnv>,
	next: Next,
): Promise<void> {
	const text = await context.req.text();
	if (context.req.path === SUBJECT_PUSH_PATH) return next();
	context.set("body", parseJson(text));
	await next();
}

const parseJson = (text: string): unknown => {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
};
