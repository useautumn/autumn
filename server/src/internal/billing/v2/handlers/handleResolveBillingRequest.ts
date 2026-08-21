import {
	AttachParamsV1Schema,
	billingParamsV1ToV0,
	cusProductToProduct,
	type FullProduct,
	Scopes,
	UpdateSubscriptionV1ParamsSchema,
} from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { findTargetCustomerProduct } from "@/internal/billing/v2/actions/updateSubscription/setup/findTargetCustomerProduct";
import { CusService } from "@/internal/customers/CusService";
import { ProductService } from "@/internal/products/ProductService";

const ResolveBillingRequestParamsSchema = z.discriminatedUnion("tool", [
	z.object({ request: AttachParamsV1Schema, tool: z.literal("attach") }),
	z.object({
		request: UpdateSubscriptionV1ParamsSchema,
		tool: z.literal("update_subscription"),
	}),
]);

/** Maps a stored V1 billing request into the dashboard's V0 dialect, with
 * `customize` resolved into concrete items against the target plan — catalog
 * items for attach, the customer's live subscription for updates. */
export const handleResolveBillingRequest = createRoute({
	scopes: [Scopes.Billing.Read],
	body: ResolveBillingRequestParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");

		let fullProduct: FullProduct;
		if (body.tool === "attach") {
			fullProduct = await ProductService.getFull({
				db: ctx.db,
				env: ctx.env,
				idOrInternalId: body.request.plan_id,
				orgId: ctx.org.id,
				version: body.request.version,
			});
		} else {
			const fullCustomer = await CusService.getFull({
				ctx,
				idOrInternalId: body.request.customer_id,
				entityId: body.request.entity_id,
			});
			const targetCustomerProduct = await findTargetCustomerProduct({
				ctx,
				fullCustomer,
				params: body.request,
			});
			fullProduct = cusProductToProduct({
				cusProduct: targetCustomerProduct,
			});
		}

		const { request, unrepresentable } = billingParamsV1ToV0({
			ctx,
			fullProduct,
			params: body.request,
		});

		return c.json(
			{ object: "billing_request_resolution", request, unrepresentable },
			200,
		);
	},
});
