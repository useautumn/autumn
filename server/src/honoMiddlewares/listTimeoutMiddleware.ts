import { ErrCode, RecaseError } from "@autumn/shared";
import type { Context, Next } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { matchRoute } from "./middlewareUtils.js";

export const LIST_REQUEST_TIMEOUT_MS = 10_000;

/** Paged reads whose result size grows with the org's data. */
export const LIST_ROUTE_PATTERNS = [
	{ method: "GET", url: "/v1/customers" },
	{ method: "POST", url: "/v1/customers/list" },
	{ method: "POST", url: "/v1/customers.list" },
	{ method: "POST", url: "/v1/entities.list" },
	{ method: "POST", url: "/v1/subscriptions.list" },
	{ method: "POST", url: "/v1/purchases.list" },
	{ method: "POST", url: "/v1/invoices.list" },
	{ method: "POST", url: "/customers/all/search" },
	{ method: "POST", url: "/customers/all/full_customers" },
];

export const isListRoute = ({
	method,
	path,
}: {
	method: string;
	path: string;
}): boolean =>
	LIST_ROUTE_PATTERNS.some((pattern) =>
		matchRoute({ url: path, method, pattern }),
	);

/** hono/timeout's race, throwing a RecaseError so the 504 follows the API error contract. */
export const createListTimeoutMiddleware =
	({ timeoutMs }: { timeoutMs: number }) =>
	async (c: Context<HonoEnv>, next: Next) => {
		if (!isListRoute({ method: c.req.method, path: c.req.path })) {
			await next();
			return;
		}

		let timer: ReturnType<typeof setTimeout> | undefined;
		const deadline = new Promise<never>((_, reject) => {
			timer = setTimeout(
				() =>
					reject(
						new RecaseError({
							message: `List request exceeded ${timeoutMs / 1000}s; use a smaller limit or cursor pagination`,
							code: ErrCode.RequestTimeout,
							statusCode: 504,
						}),
					),
				timeoutMs,
			);
		});

		try {
			await Promise.race([next(), deadline]);
		} finally {
			clearTimeout(timer);
		}
	};

export const listTimeoutMiddleware = createListTimeoutMiddleware({
	timeoutMs: LIST_REQUEST_TIMEOUT_MS,
});
