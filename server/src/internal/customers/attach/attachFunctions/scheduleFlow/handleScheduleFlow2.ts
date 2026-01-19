import {
	type AttachConfig,
	AttachFunctionResponseSchema,
	AttachScenario,
	InternalError,
	SuccessCode,
} from "@autumn/shared";
import { getLatestPeriodEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils.js";
import { subItemInCusProduct } from "@/external/stripe/stripeSubUtils/stripeSubItemUtils.js";
import { setStripeSubscriptionLock } from "@/external/stripe/subscriptions/utils/lockStripeSubscriptionUtils";
import { addProductsUpdatedWebhookTask } from "@/internal/analytics/handlers/handleProductsUpdated.js";
import { createFullCusProduct } from "@/internal/customers/add-product/createFullCusProduct.js";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import {
	attachToInsertParams,
	isFreeProduct,
} from "@/internal/products/productUtils.js";
import type { AutumnContext } from "../../../../../honoUtils/HonoEnv.js";
import {
	attachParamsToCurCusProduct,
	getCustomerSchedule,
	getCustomerSub,
} from "../../attachUtils/convertAttachParams.js";
import { paramsToScheduleItems } from "../../mergeUtils/paramsToScheduleItems.js";
import { getCurrentPhaseIndex } from "../../mergeUtils/phaseUtils/phaseUtils.js";
import { subToNewSchedule } from "../../mergeUtils/subToNewSchedule.js";
import { updateCurSchedule } from "../../mergeUtils/updateCurSchedule.js";

export const handleScheduleFunction2 = async ({
	ctx,
	attachParams,
	config,
	skipInsertCusProduct = false,
}: {
	ctx: AutumnContext;
	attachParams: AttachParams;
	config: AttachConfig;
	skipInsertCusProduct?: boolean;
}) => {
	const { logger, db } = ctx;
	const product = attachParams.products[0];
	const { stripeCli } = attachParams;

	const curCusProduct = attachParamsToCurCusProduct({
		attachParams,
	});

	const { sub: curSub } = await getCustomerSub({
		attachParams,
		targetSubId: curCusProduct?.subscription_ids?.[0],
	});

	// 1. Cancel current subscription and fetch items from other cus products...?
	let { schedule } = await getCustomerSchedule({
		attachParams,
		subId: curSub?.id,
		logger,
	});

	if (!curSub) {
		throw new InternalError({
			message: `SCHEDULE FLOW, curSub is undefined`,
		});
	}

	if (!curCusProduct) {
		throw new InternalError({
			message: `SCHEDULE FLOW, curCusProduct is undefined`,
		});
	}

	const subItems = curSub?.items.data.filter((item) =>
		subItemInCusProduct({ cusProduct: curCusProduct, subItem: item }),
	);

	if (subItems.length === 0) {
		logger.error(
			`SCHEDULE FLOW: subItems is empty, curCusProduct: ${curCusProduct.product.name}`,
		);
		throw new InternalError({
			message: `SCHEDULE FLOW: subItems is empty, curCusProduct: ${curCusProduct.product.name}`,
		});
	}

	const expectedEnd = getLatestPeriodEnd({ subItems });

	if (schedule) {
		const newItems = await paramsToScheduleItems({
			ctx,
			schedule: schedule,
			attachParams,
			config,
			billingPeriodEnd: expectedEnd,
		});

		const currentPhaseIndex = getCurrentPhaseIndex({
			schedule: { phases: newItems.phases } as any,
			now: attachParams.now,
		});

		if (currentPhaseIndex === newItems.phases.length - 1) {
			logger.info(
				`SCHEDULE FLOW: no subsequent phases, releasing schedule ${schedule?.id}`,
			);
			await stripeCli.subscriptionSchedules.release(schedule.id);
			await CusProductService.updateByStripeScheduledId({
				db,
				stripeScheduledId: schedule.id,
				updates: { scheduled_ids: [] },
			});

			await CusProductService.update({
				db,
				cusProductId: curCusProduct.id,
				updates: {
					canceled: true,
					canceled_at: Date.now(),
					ended_at: expectedEnd * 1000,
				},
			});
			schedule = undefined;
		} else {
			logger.info(`SCHEDULE FLOW: updating schedule ${schedule?.id}`);
			schedule = await updateCurSchedule({
				ctx,
				attachParams,
				schedule,
				newPhases: newItems.phases || [],
				sub: curSub,
			});

			await CusProductService.update({
				db,
				cusProductId: curCusProduct.id,
				updates: {
					scheduled_ids: [schedule.id],
					canceled_at: Date.now(),
					canceled: true,
					ended_at: expectedEnd * 1000,
				},
			});
		}
	} else {
		logger.info(`SCHEDULE FLOW: no schedule, creating new schedule`);

		// Add sub ID to upstash so renew isn't being handled...
		await setStripeSubscriptionLock({
			stripeSubscriptionId: curSub.id,
			lockedAtMs: Date.now(),
		});

		schedule = await subToNewSchedule({
			ctx,
			sub: curSub,
			attachParams,
			config,
			endOfBillingPeriod: expectedEnd,
		});

		await CusProductService.update({
			db,
			cusProductId: curCusProduct.id,
			updates: {
				canceled: true,
				canceled_at: Date.now(),
				ended_at: expectedEnd * 1000,
			},
		});
	}

	if (!schedule) {
		logger.info(`SCHEDULE FLOW: no schedule, canceling sub ${curSub?.id}`);

		// Set lock to prevent webhook handler from processing this cancellation
		await setStripeSubscriptionLock({
			stripeSubscriptionId: curSub.id,
			lockedAtMs: Date.now(),
		});

		await stripeCli.subscriptions.update(curSub.id, {
			cancel_at: expectedEnd,
			cancellation_details: {
				comment: "autumn_downgrade",
			},
		});
	}

	if (!skipInsertCusProduct) {
		await createFullCusProduct({
			db,
			attachParams: attachToInsertParams(attachParams, product),
			startsAt: expectedEnd * 1000,
			subscriptionScheduleIds: schedule ? [schedule.id] : [],
			nextResetAt: expectedEnd * 1000,
			disableFreeTrial: true,
			isDowngrade: true,
			sendWebhook: false,
			// scenario: newProductFree
			//   ? AttachScenario.Cancel
			//   : AttachScenario.Downgrade,
			logger,
		});
	}

	if (curCusProduct) {
		try {
			await addProductsUpdatedWebhookTask({
				ctx,
				internalCustomerId: curCusProduct.internal_customer_id,
				org: attachParams.org,
				env: attachParams.customer.env,
				customerId:
					attachParams.customer.id || attachParams.customer.internal_id,

				scenario: isFreeProduct(attachParams.prices)
					? AttachScenario.Cancel
					: AttachScenario.Downgrade,

				cusProduct: curCusProduct,
			});
		} catch (error) {
			logger.error("SCHEDULE FLOW: failed to add to webhook queue", { error });
		}
	}

	return AttachFunctionResponseSchema.parse({
		code: SuccessCode.DowngradeScheduled,
		message: `Successfully downgraded from ${curCusProduct.product.name} to ${product.name}`,
	});

	// if (res) {
	// 	if (req.apiVersion.gte(ApiVersion.V1_1)) {
	// 		res.status(200).json(
	// 			AttachResultSchema.parse({
	// 				code: SuccessCode.DowngradeScheduled,
	// 				message: `Successfully downgraded from ${curCusProduct.product.name} to ${product.name}`,
	// 				product_ids: [product.id],
	// 				customer_id:
	// 					attachParams.customer.id || attachParams.customer.internal_id,
	// 			}),
	// 		);
	// 	} else {
	// 		res.status(200).json({
	// 			success: true,
	// 			message: `Successfully downgraded from ${curCusProduct.product.name} to ${product.name}`,
	// 		});
	// 	}
	// }
};
