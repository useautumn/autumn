import type { ApprovalAction } from "@autumn/shared";
import type { Context, Next } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv";
import { setRouteApprovalAction } from "./routeApprovalAction";

/**
 * Router middleware naming the approval action a route performs, read from the
 * raw body because it runs before the route's scope check and validation.
 */
export const declareApprovalAction =
	({ resolve }: { resolve: (args: { body: unknown }) => ApprovalAction }) =>
	async (c: Context<HonoEnv>, next: Next) => {
		const ctx = c.get("ctx");
		setRouteApprovalAction({ ctx, action: resolve({ body: ctx.requestBody }) });
		return next();
	};
