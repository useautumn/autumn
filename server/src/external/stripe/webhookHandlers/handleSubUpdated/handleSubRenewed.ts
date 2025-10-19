import { AttachScenario, type FullCusProduct } from "@autumn/shared";
import type Stripe from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { addProductsUpdatedWebhookTask } from "@/internal/analytics/handlers/handleProductsUpdated.js";
import { isMultiProductSub } from "@/internal/customers/attach/mergeUtils/mergeUtils.js";
import { getSubScenarioFromCache } from "@/internal/customers/cusCache/subCacheUtils.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { getExistingCusProducts } from "@/internal/customers/cusProducts/cusProductUtils/getExistingCusProducts.js";
import { notNullish, nullish } from "@/utils/genUtils.js";
import type { ExtendedRequest } from "@/utils/models/Request.js";

const isSubRenewed = ({
	previousAttributes,
	sub,
}: {
	previousAttributes: any;
	sub: Stripe.Subscription;
}) => {
	// 1. If previously canceled
	const uncanceledAtPreviousEnd =
		previousAttributes.cancel_at_period_end && !sub.cancel_at_period_end;

	const uncancelAt =
		notNullish(previousAttributes.cancel_at) && nullish(sub.cancel_at);

	const uncanceledAt =
		notNullish(previousAttributes.canceled_at) && sub.canceled_at;

	return {
		renewed: uncanceledAtPreviousEnd || uncancelAt || uncanceledAt,
		renewedAt: Date.now(),
	};
};

const updateCusProductRenewed = async ({
	db,
	sub,
}: {
	db: DrizzleCli;
	sub: Stripe.Subscription;
}) => {
	if (sub.schedule) {
		return;
	}

	await CusProductService.updateByStripeSubId({
		db,
		stripeSubId: sub.id,
		updates: { canceled_at: null, canceled: false },
	});

	return;
};

export const handleSubRenewed = async ({
	req,
	prevAttributes,
	sub,
	updatedCusProducts,
}: {
	req: ExtendedRequest;
	prevAttributes: any;
	sub: Stripe.Subscription;
	updatedCusProducts: FullCusProduct[];
}) => {
	const { db, org, env, logger } = req;

	const { renewed } = isSubRenewed({
		previousAttributes: prevAttributes,
		sub,
	});

	if (!renewed || updatedCusProducts.length == 0) return;

	const subScenario = await getSubScenarioFromCache({ subId: sub.id });
	console.log(`Renewed: ${renewed}, subScenario: ${subScenario}`);
	if (subScenario === AttachScenario.Renew) return;

	const customer = updatedCusProducts[0].customer;
	const cusProducts = await CusProductService.list({
		db,
		internalCustomerId: customer!.internal_id,
	});

	console.log(`handling sub.renewed!`);

	if (isMultiProductSub({ sub, cusProducts }) || sub.schedule) return;

	await CusProductService.updateByStripeSubId({
		db,
		stripeSubId: sub.id,
		updates: { canceled_at: null, canceled: false },
	});

	if (!org.config.sync_status) return;

	const { curScheduledProduct } = getExistingCusProducts({
		product: updatedCusProducts[0].product,
		cusProducts,
		internalEntityId: updatedCusProducts[0].internal_entity_id,
	});

	const deletedCusProducts: FullCusProduct[] = [];

	if (curScheduledProduct) {
		logger.info(
			`sub.updated: renewed -> removing scheduled: ${curScheduledProduct.product.name}, main product: ${updatedCusProducts[0].product.name}`,
		);

		await CusProductService.delete({
			db,
			cusProductId: curScheduledProduct.id,
		});

		deletedCusProducts.push(curScheduledProduct);
	}

	try {
		for (const cusProd of updatedCusProducts) {
			await addProductsUpdatedWebhookTask({
				req,
				internalCustomerId: cusProd.internal_customer_id,
				org,
				env,
				customerId: null,
				logger,
				scenario: AttachScenario.Renew,
				cusProduct: cusProd,
				deletedCusProduct: deletedCusProducts.find(
					(cp) => cp.product.group === cusProd.product.group,
				),
			});
		}
	} catch (error) {}
};
