import {
	type AttachParamsV1,
	addToExpand,
	type BillingPlan,
	type Checkout,
	CheckoutAction,
	type CreateScheduleParamsV0,
	ErrCode,
	RecaseError,
	type UpdateSubscriptionV1Params,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { billingActions } from "@/internal/billing/v2/actions";
import { previewCreateScheduleWithContext } from "@/internal/billing/v2/actions/createSchedule/previewCreateSchedule";
import { billingPlanToAttachPreview } from "@/internal/billing/v2/utils/billingPlan/billingPlanToAttachPreview";
import { billingPlanToUpdateSubscriptionPreview } from "@/internal/billing/v2/utils/billingPlan/toUpdateSubscriptionPreview/billingPlanToUpdateSubscriptionPreview";
import type {
	PreviewCheckoutActionArgs,
	PreviewCheckoutActionResult,
	PreviewCheckoutAnyActionArgs,
	PreviewCheckoutAnyActionResult,
} from "./previewCheckoutActionTypes";

export async function previewCheckoutAction({
	ctx,
	checkout,
	params,
}: PreviewCheckoutAnyActionArgs): Promise<PreviewCheckoutAnyActionResult>;

export async function previewCheckoutAction({
	ctx,
	checkout,
	params,
}: PreviewCheckoutActionArgs<CheckoutAction.Attach>): Promise<
	PreviewCheckoutActionResult<CheckoutAction.Attach>
>;

export async function previewCheckoutAction({
	ctx,
	checkout,
	params,
}: PreviewCheckoutActionArgs<CheckoutAction.CreateSchedule>): Promise<
	PreviewCheckoutActionResult<CheckoutAction.CreateSchedule>
>;

export async function previewCheckoutAction({
	ctx,
	checkout,
	params,
}: PreviewCheckoutActionArgs<CheckoutAction.UpdateSubscription>): Promise<
	PreviewCheckoutActionResult<CheckoutAction.UpdateSubscription>
>;

export async function previewCheckoutAction({
	ctx,
	checkout,
	params,
}: {
	ctx: AutumnContext;
	checkout: Checkout;
	params: AttachParamsV1 | CreateScheduleParamsV0 | UpdateSubscriptionV1Params;
}): Promise<PreviewCheckoutAnyActionResult> {
	let billingPlan: BillingPlan | undefined;

	switch (checkout.action) {
		case CheckoutAction.Attach: {
			const attachResult = await billingActions.attach({
				ctx,
				params: params as AttachParamsV1,
				preview: true,
			});

			billingPlan = attachResult.billingPlan;

			if (!billingPlan) {
				break;
			}

			const preview = await billingPlanToAttachPreview({
				ctx: addToExpand({
					ctx,
					add: ["incoming.plan.items.feature", "outgoing.plan.items.feature"],
				}),
				billingContext: attachResult.billingContext,
				billingPlan,
			});

			return {
				billingContext: attachResult.billingContext,
				preview,
			};
		}
		case CheckoutAction.CreateSchedule: {
			const createScheduleResult = await previewCreateScheduleWithContext({
				ctx,
				params: params as CreateScheduleParamsV0,
			});

			billingPlan = createScheduleResult.billingPlan;

			if (!billingPlan) {
				break;
			}

			return {
				billingContext: createScheduleResult.billingContext,
				preview: createScheduleResult.preview,
			};
		}
		case CheckoutAction.UpdateSubscription: {
			const updateSubscriptionResult = await billingActions.updateSubscription({
				ctx,
				params: params as UpdateSubscriptionV1Params,
				preview: true,
			});

			billingPlan = updateSubscriptionResult.billingPlan;

			if (!billingPlan) {
				break;
			}

			const preview = await billingPlanToUpdateSubscriptionPreview({
				ctx: addToExpand({
					ctx,
					add: ["incoming.plan.items.feature", "outgoing.plan.items.feature"],
				}),
				billingContext: updateSubscriptionResult.billingContext,
				billingPlan,
			});

			return {
				billingContext: updateSubscriptionResult.billingContext,
				preview,
			};
		}
		default:
			throw new RecaseError({
				message: "Unsupported checkout action",
				code: ErrCode.InvalidRequest,
				statusCode: StatusCodes.BAD_REQUEST,
			});
	}

	throw new RecaseError({
		message: "Failed to compute billing plan",
		code: ErrCode.InternalError,
		statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
	});
}
