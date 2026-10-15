import {
	type AttachBodyV0,
	AttachFunctionResponseSchema,
	SuccessCode,
} from "@autumn/shared";
import { billingActions } from "@/internal/billing/v2/actions/index.js";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";

export const handleRenewProduct = async ({
	ctx,
	attachParams,
	body,
}: {
	ctx: AutumnContext;
	attachParams: AttachParams;
	body: AttachBodyV0;
}) => {
	await billingActions.legacy.renew({
		ctx,
		attachParams,
		body,
	});

	return AttachFunctionResponseSchema.parse({
		code: SuccessCode.RenewedProduct,
		message: `Successfully renewed product`,
	});

	// if (!otherCanceled) {
	// 	if (schedule) {
	// 		logger.info(`RENEW FLOW: releasing schedule ${schedule.id}`);
	// 		await stripeCli.subscriptionSchedules.release(schedule.id);

	// 		await CusProductService.updateByStripeScheduledId({
	// 			db,
	// 			stripeScheduledId: schedule.id,
	// 			updates: {
	// 				scheduled_ids: [],
	// 			},
	// 		});
	// 	}

	// 	if (curSubId) {
	// 		// Add sub ID to upstash so webhook handler doesn't handle again
	// 		await setStripeSubscriptionLock({
	// 			stripeSubscriptionId: curSubId,
	// 			lockedAtMs: Date.now(),
	// 		});

	// 		// Uncancel the sub
	// 		await stripeCli.subscriptions.update(curSubId, {
	// 			cancel_at: null,
	// 		});
	// 	}

	// 	await CusProductService.update({
	// 		db,
	// 		cusProductId: curCusProduct.id,
	// 		updates: {
	// 			canceled: false,
	// 			canceled_at: null,
	// 			ended_at: null,
	// 		},
	// 	});
	// } else {
	// 	// Remove scheduled product ONLY if product is not an add on
	// 	const scheduledProduct = curScheduledProduct;

	// 	// Case 1: Add current cus product back to schedule and remove scheduled product from schedule
	// 	if (schedule) {
	// 		logger.info(
	// 			`RENEW FLOW: adding cur cus product back to schedule ${schedule.id}`,
	// 		);
	// 		const newItems = await paramsToScheduleItems({
	// 			ctx,
	// 			attachParams,
	// 			config,
	// 			schedule,
	// 			removeCusProducts: scheduledProduct ? [scheduledProduct] : [],
	// 			billingPeriodEnd: expectedEnd,
	// 		});

	// 		if (newItems.phases.length > 1) {
	// 			const curSub = (await paramsToCurSub({
	// 				attachParams,
	// 			})) as Stripe.Subscription;

	// 			await CusProductService.update({
	// 				db,
	// 				cusProductId: curCusProduct.id,
	// 				updates: {
	// 					canceled: false,
	// 					canceled_at: null,
	// 					ended_at: null,
	// 				},
	// 			});
	// 		}
	// 	}
	// 	// Case 2: Create new schedule for current cus product
	// 	// Example scenario: Premium 1, Premium 2, Free 1, Free 2, Premium 1
	// 	else {
	// 		logger.info(`RENEW FLOW: creating new schedule`);
	// 		const curSub = (await cusProductToSub({
	// 			cusProduct: curCusProduct,
	// 			stripeCli,
	// 		})) as Stripe.Subscription;

	// 		await CusProductService.update({
	// 			db,
	// 			cusProductId: curCusProduct.id,
	// 			updates: {
	// 				canceled: false,
	// 				canceled_at: null,
	// 				ended_at: null,
	// 			},
	// 		});
	// 	}
	// }
};
