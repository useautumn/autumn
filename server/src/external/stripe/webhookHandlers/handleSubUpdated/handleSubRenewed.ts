import { AttachScenario, type FullCusProduct } from "@autumn/shared";
import type Stripe from "stripe";
import { getStripeSubscriptionLock } from "@/external/stripe/subscriptions/utils/lockStripeSubscriptionUtils";
import { addProductsUpdatedWebhookTask } from "@/internal/analytics/handlers/handleProductsUpdated.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { getExistingCusProducts } from "@/internal/customers/cusProducts/cusProductUtils/getExistingCusProducts.js";
import { notNullish, nullish } from "@/utils/genUtils.js";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv";

const isSubRenewed = ({
	previousAttributes,
	sub,
}: {
	previousAttributes: unknown;
	sub: Stripe.Subscription;
}) => {
	const prevAttrs = previousAttributes as Record<string, unknown>;

	// 1. If previously canceled
	const uncanceledAtPreviousEnd =
		prevAttrs.cancel_at_period_end && !sub.cancel_at_period_end;

	const uncancelAt = notNullish(prevAttrs.cancel_at) && nullish(sub.cancel_at);

	const uncanceledAt = notNullish(prevAttrs.canceled_at) && sub.canceled_at;

	return {
		renewed: uncanceledAtPreviousEnd || uncancelAt || uncanceledAt,
		renewedAt: Date.now(),
	};
};

export const handleSubRenewed = async ({
	ctx,
	prevAttributes,
	sub,
	updatedCusProducts,
}: {
	ctx: AutumnContext;
	prevAttributes: unknown;
	sub: Stripe.Subscription;
	updatedCusProducts: FullCusProduct[];
}) => {
	const { db, org, env, logger } = ctx;

	const { renewed } = isSubRenewed({
		previousAttributes: prevAttributes,
		sub,
	});

	logger.info(`sub.renewed: renewed=${renewed}`);
	if (!renewed) return;

	if (updatedCusProducts.length === 0) {
		logger.info(`sub.renewed SKIP: renewed but no updatedCusProducts`);
		return;
	}

	const subLock = await getStripeSubscriptionLock({
		stripeSubscriptionId: sub.id,
	});
	logger.info(`sub.renewed: renewed=${renewed}, subLock=${!!subLock}`);
	if (subLock) {
		logger.info(`sub.renewed SKIP: already handled by attach`);
		return;
	}

	const customer = updatedCusProducts[0].customer;
	const cusProducts = await CusProductService.list({
		db,
		internalCustomerId: customer!.internal_id,
	});

	logger.info(`handling sub.renewed!`);

	await CusProductService.updateByStripeSubId({
		db,
		stripeSubId: sub.id,
		updates: { canceled_at: null, canceled: false, ended_at: null },
	});

	if (!org.config.sync_status) {
		logger.info(`sub.renewed SKIP webhook: org.config.sync_status=false`);
		return;
	}

	const curScheduledProductsMap = new Map<string, FullCusProduct>();
	for (const x of updatedCusProducts) {
		const { curScheduledProduct } = getExistingCusProducts({
			product: x.product,
			cusProducts,
			internalEntityId: x.internal_entity_id,
		});
		if (
			curScheduledProduct &&
			!curScheduledProductsMap.has(curScheduledProduct.id)
		) {
			curScheduledProductsMap.set(curScheduledProduct.id, curScheduledProduct);
		}
	}
	const curScheduledProducts = Array.from(curScheduledProductsMap.values());

	const deletedCusProducts: FullCusProduct[] = [];

	for (const curScheduledProduct of curScheduledProducts) {
		if (!curScheduledProduct) continue;

		logger.info(
			`sub.updated: renewed -> removing scheduled: ${curScheduledProduct.product.name}, main product: ${updatedCusProducts[0].product.name}`,
		);

		await CusProductService.delete({
			db,
			cusProductId: curScheduledProduct.id,
		});

		deletedCusProducts.push(curScheduledProduct);
	}

	for (const cusProd of updatedCusProducts) {
		try {
			await addProductsUpdatedWebhookTask({
				ctx,
				internalCustomerId: cusProd.internal_customer_id,
				org,
				env,
				customerId: null,
				scenario: AttachScenario.Renew,
				cusProduct: cusProd,
				deletedCusProduct: deletedCusProducts.find(
					(cp) => cp.product.group === cusProd.product.group,
				),
			});
			logger.info(`sub.renewed ✅ SENT webhook for ${cusProd.product.name}`);
		} catch (error) {
			logger.error(
				`sub.renewed ❌ FAILED webhook for ${cusProd.product.name}`,
				error,
			);
		}
	}
};
