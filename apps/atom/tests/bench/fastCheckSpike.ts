/**
 * Bench only, a spike: the public check route without Hono, to price what Hono and its layers cost an owned check.
 * Same steps as the Hono chain (admission, body, owner, token, contract, processor, count); anything it would not
 * answer the same way (a hop, a refusal, an error) is handed to the Hono app with the body re-attached.
 */

import type { Hono } from "hono";
import { newRequestId } from "../../src/http/handlers/receiveCheck.js";
import { MAX_LOOP_LAG_MS } from "../../src/http/middlewares/admissionMiddleware.js";
import { countRequest } from "../../src/http/middlewares/requestLog/countRequest.js";
import type {
	AtomHttpContext,
	AtomHttpEnv,
} from "../../src/http/types/atomHttp.js";
import { checkCallToRequest } from "../../src/lib/contracts/checkContract.js";
import { timeStage } from "../../src/threads/stats/stageClock.js";

const JSON_HEADERS = { "content-type": "application/json" };

export const createFastCheck = ({
	ctx,
	app,
}: {
	ctx: AtomHttpContext;
	app: Hono<AtomHttpEnv>;
}) => {
	const viaHono = (request: Request, text: string) =>
		app.fetch(
			new Request(request.url, {
				method: request.method,
				headers: request.headers,
				body: text,
			}),
		);

	return async function fastCheck(request: Request): Promise<Response> {
		if (ctx.stopping?.() || ctx.loop.lagMs() > MAX_LOOP_LAG_MS)
			return app.fetch(request);
		const text = await request.text();
		return timeStage("honoDispatch", async () => {
			let body: { customer_id?: unknown } | undefined;
			try {
				body = JSON.parse(text);
			} catch {
				return viaHono(request, text);
			}
			const customerId = body?.customer_id;
			if (typeof customerId !== "string" || customerId === "")
				return viaHono(request, text);
			if ((await ctx.peer.ring.ownerOf({ customerId })) !== ctx.peer.ring.self)
				return viaHono(request, text);
			const token = request.headers.get("x-atom-token");
			const slots = token ? ctx.auth.authorize({ token }) : null;
			if (!slots) return viaHono(request, text);
			let checkRequest: ReturnType<typeof checkCallToRequest>;
			try {
				checkRequest = checkCallToRequest({
					body,
					query: {},
					apiVersionHeader: request.headers.get("x-api-version") ?? undefined,
					idempotencyKey: request.headers.get("idempotency-key") ?? undefined,
					requestId: newRequestId(),
					occurredAt: Date.now(),
				});
			} catch {
				return viaHono(request, text);
			}
			// A processor error would be the Hono error handler's; the bench's checks never raise one.
			const { json } = await slots
				.processorFor({ customerId })
				.check({ request: checkRequest });
			countRequest({
				counters: ctx.counters,
				path: "/v1/balances.check",
				statusCode: 200,
				forwarded: false,
			});
			return new Response(json, { status: 200, headers: JSON_HEADERS });
		});
	};
};
