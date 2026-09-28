import { Hono } from "hono";
import { CostsQuery } from "../../api/contract.ts";
import { getCosts } from "../../internal/costs/actions/getCosts.ts";
import { TwdError } from "../apiError.ts";
import type { TwdHono } from "../types/twdHono.ts";

export const costsRoutes = new Hono<TwdHono>().get("/costs", async (c) => {
	const query = CostsQuery.safeParse(c.req.query());
	if (!query.success) {
		throw new TwdError({
			status: 400,
			code: "invalid_query",
			message: query.error.issues.map((i) => i.message).join("; "),
			next: "Use ?from=<ISO date>&to=<ISO date>&bucket=day|week; omit from/to for the last 30 days.",
		});
	}
	return c.json(await getCosts({ ctx: c.get("ctx"), query: query.data }));
});
