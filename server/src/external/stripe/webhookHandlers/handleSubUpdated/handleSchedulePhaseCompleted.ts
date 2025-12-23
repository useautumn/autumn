import {
	AttachScenario,
	CusProductStatus,
	formatMs,
	formatMsToDate,
	formatSeconds,
	isCustomerProductExpired,
} from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import type { ExpandedStripeSubscription } from "@/external/stripe/subscriptions/operations/getExpandedStripeSubscription.js";
import { addProductsUpdatedWebhookTask } from "@/internal/analytics/handlers/handleProductsUpdated.js";
import { getSubScenarioFromCache } from "@/internal/customers/cusCache/subCacheUtils.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { notNullish } from "@/utils/genUtils.js";
import { getStripeNow } from "@/utils/scriptUtils/testClockUtils.js";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import { deleteCachedApiCustomer } from "../../../../internal/customers/cusUtils/apiCusCacheUtils/deleteCachedApiCustomer.js";

export const handleSchedulePhaseCompleted = async ({
	ctx,
	stripeSubscription,
	prevAttributes,
}: {
	ctx: AutumnContext;
	stripeSubscription: ExpandedStripeSubscription;
	// biome-ignore lint/suspicious/noExplicitAny: Don't know the type of prevAttributes
	prevAttributes: any;
}) => {
	if (await getSubScenarioFromCache({ subId: stripeSubscription.id })) {
		return;
	}

	const { db, org, env, logger } = ctx;

	const phasePossiblyChanged =
		notNullish(prevAttributes?.items) &&
		notNullish(stripeSubscription.schedule);

	if (!phasePossiblyChanged) return;

	const stripeSubscriptionSchedule = stripeSubscription.schedule;

	const stripeCli = createStripeCli({ org, env });

	const cusProducts = await CusProductService.getByScheduleId({
		db,
		scheduleId: stripeSubscriptionSchedule.id,
		orgId: org.id,
		env,
	});

	const nowMs = await getStripeNow({
		stripeCli,
		stripeCus: stripeSubscription.customer,
	});

	logger.info(`handling schedule phase completed for ${stripeSubscription.id}`);
	logger.info(`now date: ${formatMsToDate(nowMs)}`);

	console.log(
		"cusProducts",
		cusProducts.map((cp) => ({
			name: cp.product.name,
			status: cp.status,
			start: formatMs(cp.starts_at),
			end: formatMs(cp.ended_at),
		})),
	);

	for (const cusProduct of cusProducts) {
		const shouldExpire = isCustomerProductExpired(cusProduct, { nowMs });

		if (shouldExpire) {
			logger.info(
				`❌ expiring cus product: ${cusProduct.product.name} (entity ID: ${cusProduct.entity_id})`,
			);
			await CusProductService.update({
				db,
				cusProductId: cusProduct.id,
				updates: { status: CusProductStatus.Expired },
			});

			await addProductsUpdatedWebhookTask({
				ctx,
				internalCustomerId: cusProduct.internal_customer_id,
				org,
				env,
				customerId: null,
				scenario: AttachScenario.Expired,
				cusProduct: cusProduct,
			});
		}

		const shouldActivateCustomerProduct = () => {
			if (cusProduct.status !== CusProductStatus.Scheduled) return false;

			return cusProduct.starts_at <= nowMs;
		};

		if (shouldActivateCustomerProduct()) {
			console.log(
				"✅ activating scheduled customer product",
				cusProduct.product.name,
			);
			await CusProductService.update({
				db,
				cusProductId: cusProduct.id,
				updates: {
					status: CusProductStatus.Active,
					subscription_ids: [stripeSubscription.id],
					scheduled_ids: [stripeSubscriptionSchedule.id],
				},
			});
		}

		// Maybe activate default product?
		await deleteCachedApiCustomer({
			customerId: cusProduct.customer?.id || "",
			orgId: org.id,
			env,
			source: "handleSchedulePhaseCompleted",
		});
	}

	console.log(
		"Stripe subscription schedule phases:",
		stripeSubscriptionSchedule.phases.map((phase) => ({
			start_date: formatSeconds(phase.start_date),
			end_date: formatSeconds(phase.end_date),
			trial_end: formatSeconds(phase.trial_end),
		})),
	);
	const currentPhase = stripeSubscriptionSchedule.phases.findIndex(
		(phase) =>
			phase.start_date <= Math.floor(nowMs / 1000) &&
			(phase.end_date ? phase.end_date > Math.floor(nowMs / 1000) : true),
	);

	console.log("Current phase: ", currentPhase);

	if (
		currentPhase === stripeSubscriptionSchedule.phases.length - 1 &&
		stripeSubscriptionSchedule.status !== "released"
	) {
		console.log("Releasing schedule");
		try {
			// Last phase, cancel schedule
			await stripeCli.subscriptionSchedules.release(
				stripeSubscriptionSchedule.id,
			);
			await CusProductService.updateByStripeScheduledId({
				db,
				stripeScheduledId: stripeSubscriptionSchedule.id,
				updates: {
					scheduled_ids: [],
				},
			});
		} catch (error: unknown) {
			if (error instanceof Error) {
				if (process.env.NODE_ENV === "development") {
					logger.warn(
						`schedule.phase.completed: failed to cancel schedule ${stripeSubscriptionSchedule.id}, error: ${error.message}`,
					);
				} else {
					logger.error(
						`schedule.phase.completed: failed to cancel schedule ${stripeSubscriptionSchedule.id}, error: ${error.message}`,
					);
				}
			}
		}
	}
};

// ACTIVATING FUTURE PRODUCT
// const futureCusProduct = await activateFutureProduct({
// 	ctx,
// 	cusProduct,
// });

// if (futureCusProduct) {
// 	const fullFutureProduct = cusProductToProduct({
// 		cusProduct: futureCusProduct,
// 	});

// 	if (
// 		!isFreeProduct({ prices: fullFutureProduct.prices }) &&
// 		!isOneOffProduct({ prices: fullFutureProduct.prices })
// 	) {
// 		await CusProductService.update({
// 			db,
// 			cusProductId: futureCusProduct.id,
// 			updates: {
// 				subscription_ids: [subObject.id],
// 				scheduled_ids: [schedule.id],
// 			},
// 		});
// 	}
// }
