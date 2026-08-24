import {
	AttachParamsV1Schema,
	billingParamsV1ToV0,
	CreateScheduleParamsV0Schema,
	type CreateSchedulePlanV0,
	cusProductToProduct,
	customizePlanV1ToV0,
	type FullProduct,
	Scopes,
	UpdateSubscriptionV1ParamsSchema,
} from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { findTargetCustomerProduct } from "@/internal/billing/v2/actions/updateSubscription/setup/findTargetCustomerProduct";
import { CusService } from "@/internal/customers/CusService";
import { ProductService } from "@/internal/products/ProductService";

const ResolveBillingRequestParamsSchema = z.discriminatedUnion("tool", [
	z.object({ request: AttachParamsV1Schema, tool: z.literal("attach") }),
	z.object({
		request: CreateScheduleParamsV0Schema,
		tool: z.literal("create_schedule"),
	}),
	z.object({
		request: UpdateSubscriptionV1ParamsSchema,
		tool: z.literal("update_subscription"),
	}),
]);

const resolveSchedulePlan = async ({
	ctx,
	plan,
}: {
	ctx: AutumnContext;
	plan: CreateSchedulePlanV0;
}) => {
	if (!plan.customize) return plan;
	const fullProduct = await ProductService.getFull({
		db: ctx.db,
		env: ctx.env,
		idOrInternalId: plan.plan_id,
		orgId: ctx.org.id,
		version: plan.version,
	});
	const { customize, ...rest } = plan;
	return {
		...rest,
		items: customizePlanV1ToV0({
			ctx,
			customizePlanV1: customize,
			fullProduct,
		}),
	};
};

/** Maps a stored billing request into the dashboard's dialect — `customize`
 * resolves to items against catalog plans (attach/schedule) or the live
 * subscription (updates). */
export const handleResolveBillingRequest = createRoute({
	scopes: [Scopes.Billing.Read],
	body: ResolveBillingRequestParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");

		if (body.tool === "create_schedule") {
			const resolvePlans = (plans: ReadonlyArray<CreateSchedulePlanV0>) =>
				Promise.all(plans.map((plan) => resolveSchedulePlan({ ctx, plan })));
			const request = {
				...body.request,
				phases: await Promise.all(
					body.request.phases.map(async (phase) => ({
						...phase,
						plans: await resolvePlans(phase.plans),
					})),
				),
				...(body.request.unscheduled_plans
					? {
							unscheduled_plans: await resolvePlans(
								body.request.unscheduled_plans,
							),
						}
					: {}),
			};
			return c.json(
				{ object: "billing_request_resolution", request, unrepresentable: [] },
				200,
			);
		}

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
