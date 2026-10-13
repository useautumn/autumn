import { getPostgresPools } from "@autumn/postgres";
import { ErrCode, RecaseError } from "@autumn/shared";
import type { Context, Next } from "hono";
import { type DrizzleCli, dbList } from "@/db/initDrizzle.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { matchRoute } from "./middlewareUtils.js";

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

const listTimeoutError = ({ timeoutMs }: { timeoutMs: number }) =>
	new RecaseError({
		message: `List request exceeded ${timeoutMs / 1000}s; use a smaller limit or cursor pagination`,
		code: ErrCode.RequestTimeout,
		statusCode: 504,
	});

/**
 * List routes run on the list pool unless the replica lane already claimed them. The response is bounded by
 * the pool's own query clock, which starts here and so always fires before pg's does for the same read.
 */
export const createListReadMiddleware =
	({ listDb, timeoutMs }: { listDb: DrizzleCli; timeoutMs: number }) =>
	async (c: Context<HonoEnv>, next: Next) => {
		if (!isListRoute({ method: c.req.method, path: c.req.path })) {
			await next();
			return;
		}

		const ctx = c.get("ctx");
		if (!ctx.useReplicaDb) ctx.db = listDb;

		let timer: ReturnType<typeof setTimeout> | undefined;
		const deadline = new Promise<never>((_, reject) => {
			timer = setTimeout(
				() => reject(listTimeoutError({ timeoutMs })),
				timeoutMs,
			);
		});

		try {
			await Promise.race([next(), deadline]);
		} finally {
			clearTimeout(timer);
		}
	};

export const listReadMiddleware = createListReadMiddleware({
	listDb: dbList,
	timeoutMs: getPostgresPools().list.queryTimeoutMs,
});
