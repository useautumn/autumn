import {
	type AttachBodyV0,
	AttachFunctionResponseSchema,
	SuccessCode,
} from "@autumn/shared";
import { billingActions } from "@/internal/billing/v2/actions/index.js";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import type { AutumnContext } from "../../../../../honoUtils/HonoEnv.js";

export const handleScheduleFunction2 = async ({
	ctx,
	attachParams,
	body,
}: {
	ctx: AutumnContext;
	attachParams: AttachParams;
	body: AttachBodyV0;
}) => {
	// // 1. Cancel current subscription and fetch items from other cus products...?
	// let { schedule } = await getCustomerSchedule({
	// 	attachParams,
	// 	subId: curSub?.id,
	// 	logger,
	// });

	// if (schedule) {
	// 	const newItems = await paramsToScheduleItems({
	// 		ctx,
	// 		schedule: schedule,
	// 		attachParams,
	// 		config,
	// 		billingPeriodEnd: expectedEnd,
	// 	});

	// 	if (currentPhaseIndex === newItems.phases.length - 1) {
	// 		logger.info(
	// 			`SCHEDULE FLOW: no subsequent phases, releasing schedule ${schedule?.id}`,
	// 		);
	// 		await stripeCli.subscriptionSchedules.release(schedule.id);
	// 		await CusProductService.updateByStripeScheduledId({
	// 			db,
	// 			stripeScheduledId: schedule.id,
	// 			updates: { scheduled_ids: [] },
	// 		});

	// 		await CusProductService.update({
	// 			db,
	// 			cusProductId: curCusProduct.id,
	// 			updates: {
	// 				scheduled_ids: [schedule.id],
	// 				canceled_at: Date.now(),
	// 				canceled: true,
	// 				ended_at: expectedEnd * 1000,
	// 			},
	// 		});
	// 	}
	// } else {
	// 	logger.info(`SCHEDULE FLOW: no schedule, creating new schedule`);

	// 	// Add sub ID to upstash so renew isn't being handled...
	// 	await setStripeSubscriptionLock({
	// 		stripeSubscriptionId: curSub.id,
	// 		lockedAtMs: Date.now(),
	// 	});

	// 	await CusProductService.update({
	// 		db,
	// 		cusProductId: curCusProduct.id,
	// 		updates: {
	// 			canceled: true,
	// 			canceled_at: Date.now(),
	// 			ended_at: expectedEnd * 1000,
	// 		},
	// 	});
	// }

	// 	// Set lock to prevent webhook handler from processing this cancellation
	// 	await setStripeSubscriptionLock({
	// 		stripeSubscriptionId: curSub.id,
	// 		lockedAtMs: Date.now(),
	// 	});

	// 	await stripeCli.subscriptions.update(curSub.id, {
	// 		cancel_at: expectedEnd,
	// 		cancellation_details: {
	// 			comment: "autumn_downgrade",
	// 		},
	// 	});
	// }

	// if (curCusProduct) {
	// 	try {
	// 		await addProductsUpdatedWebhookTask({
	// 			ctx,
	// 			internalCustomerId: curCusProduct.internal_customer_id,
	// 			org: attachParams.org,
	// 			env: attachParams.customer.env,
	// 			customerId:
	// 				attachParams.customer.id || attachParams.customer.internal_id,

	// 			cusProduct: curCusProduct,
	// 		});
	// 	} catch (error) {
	// 		logger.error("SCHEDULE FLOW: failed to add to webhook queue", { error });
	// 	}
	// }

	const { billingContext } = await billingActions.legacy.attach({
		ctx,
		attachParams,
		planTiming: "end_of_cycle",
	});

	const curCusProduct = billingContext.currentCustomerProduct;
	const product = attachParams.products[0];

	return AttachFunctionResponseSchema.parse({
		code: SuccessCode.DowngradeScheduled,
		message: `Successfully downgraded from ${curCusProduct?.product.name} to ${product.name}`,
	});
};
