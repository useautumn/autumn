import {
	AttachScenario,
	CusProductStatus,
	cusProductToProduct,
} from "@autumn/shared";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { addProductsUpdatedWebhookTask } from "@/internal/analytics/handlers/handleProductsUpdated.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { activateFutureProduct } from "@/internal/customers/cusProducts/cusProductUtils.js";
import { isFreeProduct, isOneOff } from "@/internal/products/productUtils.js";
import { notNullish } from "@/utils/genUtils.js";
import { getStripeNow } from "@/utils/scriptUtils/testClockUtils.js";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";

export const handleSchedulePhaseCompleted = async ({
	ctx,
	subObject,
	prevAttributes,
}: {
	ctx: AutumnContext;
	subObject: Stripe.Subscription;
	// biome-ignore lint/suspicious/noExplicitAny: Don't know the type of prevAttributes
	prevAttributes: any;
}) => {
	const { db, org, env, logger } = ctx;

	const phasePossiblyChanged =
		notNullish(prevAttributes?.items) && notNullish(subObject.schedule);

	if (!phasePossiblyChanged) return;

	const stripeCli = createStripeCli({ org, env });
	const schedule = await stripeCli.subscriptionSchedules.retrieve(
		subObject.schedule as string,
		{
			expand: ["customer"],
		},
	);

	const cusProducts = await CusProductService.getByScheduleId({
		db,
		scheduleId: schedule.id,
		orgId: org.id,
		env,
	});

	const now = await getStripeNow({
		stripeCli,
		stripeCus: schedule.customer as Stripe.Customer,
	});

	for (const cusProduct of cusProducts) {
		const shouldExpire =
			cusProduct.canceled && cusProduct.ended_at && now >= cusProduct.ended_at;

		if (shouldExpire) {
			logger.info(
				`Expiring cus product: ${cusProduct.product.name} (entity ID: ${cusProduct.entity_id})`,
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

			// ACTIVATING FUTURE PRODUCT
			const futureCusProduct = await activateFutureProduct({
				ctx,
				cusProduct,
			});

			if (futureCusProduct) {
				const fullFutureProduct = cusProductToProduct({
					cusProduct: futureCusProduct,
				});

				if (
					!isFreeProduct(fullFutureProduct.prices) &&
					!isOneOff(fullFutureProduct.prices)
				) {
					await CusProductService.update({
						db,
						cusProductId: futureCusProduct.id,
						updates: {
							subscription_ids: [subObject.id],
							scheduled_ids: [schedule.id],
						},
					});
				}
			}
		}
	}

	const currentPhase = schedule.phases.findIndex(
		(phase) =>
			phase.start_date <= Math.floor(now / 1000) &&
			(phase.end_date ? phase.end_date > Math.floor(now / 1000) : true),
	);

	if (
		currentPhase === schedule.phases.length - 1 &&
		schedule.status !== "released"
	) {
		try {
			// Last phase, cancel schedule
			await stripeCli.subscriptionSchedules.release(schedule.id);
			await CusProductService.updateByStripeScheduledId({
				db,
				stripeScheduledId: schedule.id,
				updates: {
					scheduled_ids: [],
				},
			});
		} catch (error: unknown) {
			if (error instanceof Error) {
				if (process.env.NODE_ENV === "development") {
					logger.warn(
						`schedule.phase.completed: failed to cancel schedule ${schedule.id}, error: ${error.message}`,
					);
				} else {
					logger.error(
						`schedule.phase.completed: failed to cancel schedule ${schedule.id}, error: ${error.message}`,
					);
				}
			}
		}
	}
};
