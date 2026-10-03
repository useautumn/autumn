import type { Context, MiddlewareHandler, Next } from "hono";
import type {
	BalanceWorkerHttpContext,
	BalanceWorkerHttpEnv,
} from "../../types/balanceWorkerHttp.js";
import { resolveRequestRuntime } from "./resolveRequestRuntime.js";
import { readRequestBudget, withRequestBudget } from "./withRequestBudget.js";

export function runtimeRoutingMiddleware({
	ctx,
}: {
	ctx: BalanceWorkerHttpContext;
}): MiddlewareHandler<BalanceWorkerHttpEnv> {
	async function routeRequest(
		context: Context<BalanceWorkerHttpEnv>,
		next: Next,
	) {
		const { route, command } = context.get("request");
		const runtime = await resolveRequestRuntime({
			ctx,
			route,
			command,
		});
		context.set("ctx", {
			runtime: withRequestBudget({
				runtime,
				budget: readRequestBudget(context),
			}),
		});
		await next();
	}
	return routeRequest;
}
