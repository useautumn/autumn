import {
	AttachScenario,
	CusProductStatus,
	type FullCustomer,
	formatMs,
	isCustomerProductExpired,
} from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { stripeCustomerToNowMs } from "@/external/stripe/customers/index";
import { isStripeSubscriptionScheduleInLastPhase } from "@/external/stripe/subscriptionSchedules/utils/classifyStripeSubscriptionScheduleUtils";
import { stripeSubscriptionScheduleToPhaseIndex } from "@/external/stripe/subscriptionSchedules/utils/convertStripeSubscriptionScheduleUtils";
import type { ExpandedStripeSubscription } from "@/external/stripe/subscriptions/operations/getExpandedStripeSubscription.js";
import { getStripeSubscriptionLock } from "@/external/stripe/subscriptions/utils/lockStripeSubscriptionUtils";
import { addProductsUpdatedWebhookTask } from "@/internal/analytics/handlers/handleProductsUpdated.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { notNullish } from "@/utils/genUtils.js";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import { deleteCachedApiCustomer } from "../../../../internal/customers/cusUtils/apiCusCacheUtils/deleteCachedApiCustomer.js";

export const handleSchedulePhaseCompleted = async ({
	ctx,
	stripeSubscription,
	prevAttributes,
	fullCustomer,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	stripeSubscription: ExpandedStripeSubscription;
	// biome-ignore lint/suspicious/noExplicitAny: Don't know the type of prevAttributes
	prevAttributes: any;
}) => {
	if (
		await getStripeSubscriptionLock({
			stripeSubscriptionId: stripeSubscription.id,
		})
	) {
		ctx.logger.info(
			`[handleSchedulePhaseCompleted] SKIP: subscription is locked`,
		);
		return;
	}

	const { db, org, env, logger } = ctx;

	const phasePossiblyChanged =
		notNullish(prevAttributes?.items) &&
		notNullish(stripeSubscription.schedule);

	if (!phasePossiblyChanged) return;

	const stripeSubscriptionSchedule = stripeSubscription.schedule;
	const stripeCli = createStripeCli({ org, env });
	const customerProducts = fullCustomer.customer_products;

	const nowMs = await stripeCustomerToNowMs({
		stripeCli,
		stripeCustomer: stripeSubscription.customer,
	});

	const currentPhaseIndex = stripeSubscriptionScheduleToPhaseIndex({
		stripeSubscriptionSchedule,
		nowMs,
	});

	logger.info(
		`[handleSchedulePhaseCompleted] sub: ${stripeSubscription.id}, now: ${formatMs(nowMs)}, currentPhase: ${currentPhaseIndex + 1}/${stripeSubscriptionSchedule.phases.length}`,
	);

	for (const cusProduct of customerProducts) {
		const shouldExpire = isCustomerProductExpired(cusProduct, { nowMs });

		if (shouldExpire) {
			logger.info(
				`[handleSchedulePhaseCompleted] ❌ expiring: ${cusProduct.product.name}${cusProduct.entity_id ? `@${cusProduct.entity_id}` : ""}`,
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
			logger.info(
				`[handleSchedulePhaseCompleted] ✅ activating: ${cusProduct.product.name}${cusProduct.entity_id ? `@${cusProduct.entity_id}` : ""}`,
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

		await deleteCachedApiCustomer({
			customerId: cusProduct.customer?.id || "",
			orgId: org.id,
			env,
			source: "handleSchedulePhaseCompleted",
		});
	}

	if (
		isStripeSubscriptionScheduleInLastPhase({
			stripeSubscriptionSchedule,
			nowMs,
		})
	) {
		logger.debug(
			`[handleSchedulePhaseCompleted] releasing schedule (last phase reached)`,
		);
		try {
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
						`[handleSchedulePhaseCompleted] failed to release schedule: ${error.message}`,
					);
				} else {
					logger.error(
						`[handleSchedulePhaseCompleted] failed to release schedule: ${error.message}`,
					);
				}
			}
		}
	}
};
