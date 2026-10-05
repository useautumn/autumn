import {
	type AttachParamsV0,
	AttachParamsV1Schema,
	billingParamsV1ToV0,
	type CreateScheduleParamsV0,
	CreateScheduleParamsV0Schema,
	type CreateSchedulePlanV0,
	cusProductToProduct,
	customizePlanV1ToV0,
	type FullProduct,
	type SetPlansParamsV0,
	SetPlansParamsV0Schema,
	type UpdateSubscriptionV0Params,
	UpdateSubscriptionV1ParamsSchema,
} from "@autumn/shared";
import { z } from "zod/v4";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { createScheduleParamsToSetPlansParams } from "@/internal/billing/v2/actions/setPlans/utils/createScheduleParamsToSetPlansParams";
import { findTargetCustomerProduct } from "@/internal/billing/v2/actions/updateSubscription/setup/findTargetCustomerProduct";
import { CusService } from "@/internal/customers/CusService";
import { ProductService } from "@/internal/products/ProductService";

export const ResolveBillingRequestParamsSchema = z.discriminatedUnion("tool", [
	z.object({ request: AttachParamsV1Schema, tool: z.literal("attach") }),
	z.object({
		request: CreateScheduleParamsV0Schema,
		tool: z.literal("create_schedule"),
	}),
	z.object({
		request: SetPlansParamsV0Schema,
		tool: z.literal("set_plans"),
	}),
	z.object({
		request: UpdateSubscriptionV1ParamsSchema,
		tool: z.literal("update_subscription"),
	}),
]);

export type ResolveBillingRequestParams = z.infer<
	typeof ResolveBillingRequestParamsSchema
>;

export type ResolvedBillingRequestV0 =
	| AttachParamsV0
	| SetPlansParamsV0
	| UpdateSubscriptionV0Params;

/** Resolves one plan's `customize` patch into concrete V0 items against its
 * catalog plan — shared by schedule resolution and multi-attach generation. */
export const resolveCustomizedPlan = async ({
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

/** Resolves every phase's and unscheduled plan's `customize` into items. */
const resolveSchedulePlans = async <
	Request extends CreateScheduleParamsV0 | SetPlansParamsV0,
>({
	ctx,
	request,
}: {
	ctx: AutumnContext;
	request: Request;
}): Promise<Request> => {
	const resolvePlans = (plans: ReadonlyArray<CreateSchedulePlanV0>) =>
		Promise.all(plans.map((plan) => resolveCustomizedPlan({ ctx, plan })));
	return {
		...request,
		phases: await Promise.all(
			request.phases.map(async (phase) => ({
				...phase,
				plans: await resolvePlans(phase.plans),
			})),
		),
		...(request.unscheduled_plans
			? { unscheduled_plans: await resolvePlans(request.unscheduled_plans) }
			: {}),
	};
};

/** Maps a billing request into the dashboard's dialect — `customize` resolves
 * to items against catalog plans (attach/schedule) or the live subscription (updates). */
export const resolveBillingRequest = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: ResolveBillingRequestParams;
}): Promise<{
	request: ResolvedBillingRequestV0;
	unrepresentable: string[];
}> => {
	if (params.tool === "create_schedule") {
		const request = await resolveSchedulePlans({
			ctx,
			request: params.request,
		});
		return {
			request: createScheduleParamsToSetPlansParams({ params: request }),
			unrepresentable: [],
		};
	}

	if (params.tool === "set_plans") {
		return {
			request: await resolveSchedulePlans({ ctx, request: params.request }),
			unrepresentable: [],
		};
	}

	let fullProduct: FullProduct;
	if (params.tool === "attach") {
		fullProduct = await ProductService.getFull({
			db: ctx.db,
			env: ctx.env,
			idOrInternalId: params.request.plan_id,
			orgId: ctx.org.id,
			version: params.request.version,
		});
	} else {
		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: params.request.customer_id,
			entityId: params.request.entity_id,
		});
		const targetCustomerProduct = await findTargetCustomerProduct({
			ctx,
			fullCustomer,
			params: params.request,
		});
		fullProduct = params.request.version
			? await ProductService.getFull({
					db: ctx.db,
					env: ctx.env,
					idOrInternalId: targetCustomerProduct.product.id,
					orgId: ctx.org.id,
					version: params.request.version,
				})
			: cusProductToProduct({ cusProduct: targetCustomerProduct });
	}

	const { request, unrepresentable } = billingParamsV1ToV0({
		ctx,
		fullProduct,
		params: params.request,
	});
	return {
		request:
			params.tool === "attach"
				? (request as AttachParamsV0)
				: (request as UpdateSubscriptionV0Params),
		unrepresentable,
	};
};
