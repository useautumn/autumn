import type { Context, MiddlewareHandler, Next } from "hono";
import type {
	BalanceWorkerHttpContext,
	BalanceWorkerHttpEnv,
} from "../../types/balanceWorkerHttp.js";
import { resolveRequestRuntime } from "./resolveRequestRuntime.js";

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
		const runtime = resolveRequestRuntime({
			ctx,
			route,
			command,
		});
		context.set("ctx", { runtime });
		await next();
	}
	return routeRequest;
}
