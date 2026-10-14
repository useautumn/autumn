import type { Context } from "hono";
import type { AtomHttpEnv } from "../types/atomHttp.js";

const HOP_HEADERS = ["host", "connection", "content-length"];

export const forwardRequest = async ({
	context,
	target,
	headers = {},
	heldBack = [],
	replyHeaders,
	timeoutMs,
	send = fetch,
}: {
	context: Context<AtomHttpEnv>;
	target: string;
	headers?: Record<string, string>;
	heldBack?: string[];
	replyHeaders: Record<string, string>;
	timeoutMs: number;
	send?: typeof fetch;
}): Promise<Response> => {
	const sent = new Headers(context.req.raw.headers);
	for (const name of [...HOP_HEADERS, ...heldBack]) sent.delete(name);
	for (const [name, value] of Object.entries(headers)) sent.set(name, value);
	const reply = await send(target, {
		method: context.req.method,
		headers: sent,
		body: await context.req.text(),
		signal: AbortSignal.any([
			context.req.raw.signal,
			AbortSignal.timeout(timeoutMs),
		]),
	});
	const replied = new Headers(replyHeaders);
	const contentType = reply.headers.get("content-type");
	if (contentType) replied.set("content-type", contentType);
	return new Response(reply.body, { status: reply.status, headers: replied });
};
