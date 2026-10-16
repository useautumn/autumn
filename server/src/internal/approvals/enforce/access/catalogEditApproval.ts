import type { Context, Next } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv";
import { checkCatalogEditApprovals } from "../checkCatalogEditApprovals";
import { setRouteApprovalAction } from "./routeApprovalAction";

type CatalogEditRequest = {
	body: Record<string, unknown>;
	params: Record<string, string>;
};

/**
 * Router middleware for a single plan or feature route: names its action for the
 * scope check, then checks every id the request edits (a rename edits two).
 */
export const catalogEditApproval =
	({
		action,
		ids,
	}: {
		action: "catalog.edit_plans" | "catalog.edit_features";
		ids: (request: CatalogEditRequest) => unknown[];
	}) =>
	async (c: Context<HonoEnv>, next: Next) => {
		const ctx = c.get("ctx");
		setRouteApprovalAction({ ctx, action });

		const body = (ctx.requestBody ?? {}) as Record<string, unknown>;
		const editedIds = ids({ body, params: c.req.param() });
		await checkCatalogEditApprovals({
			ctx,
			...(action === "catalog.edit_plans"
				? { planIds: editedIds }
				: { featureIds: editedIds }),
		});
		return next();
	};
