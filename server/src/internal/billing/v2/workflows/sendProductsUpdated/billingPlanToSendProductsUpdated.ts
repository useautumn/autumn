import type { AutumnBillingPlan, FullCustomer } from "@autumn/shared";
import {
	AttachScenario,
	CusProductStatus,
	cusProductToPrices,
	type FullCusProduct,
	isCustomerProductFree,
	isCustomerProductScheduled,
	isProductUpgrade,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	getExpiredUpdatedCustomerProducts,
	getUpdateCustomerProducts,
} from "@/internal/billing/v2/utils/billingPlan/customerProductPlanMutations";
import { workflows } from "@/queue/workflows.js";

type UpdateCustomerProductUpdates = NonNullable<
	NonNullable<AutumnBillingPlan["updateCustomerProduct"]>["updates"]
>;

const hasPaidScheduledProduct = ({
	customerProducts,
}: {
	customerProducts: FullCusProduct[];
}): boolean => {
	return customerProducts.some(
		(cp) =>
			cp.status === CusProductStatus.Scheduled && !isCustomerProductFree(cp),
	);
};

const getUpdateScenario = ({
	updates,
	insertCustomerProducts,
}: {
	updates: UpdateCustomerProductUpdates;
	insertCustomerProducts: FullCusProduct[];
}): AttachScenario | null => {
	if (
		updates.canceled === true &&
		updates.canceled_at != null &&
		updates.ended_at != null
	) {
		return hasPaidScheduledProduct({ customerProducts: insertCustomerProducts })
			? AttachScenario.Downgrade
			: AttachScenario.Cancel;
	}

	if (updates.status === CusProductStatus.Expired) {
		return AttachScenario.Expired;
	}

	if (
		updates.canceled === false &&
		updates.canceled_at === null &&
		updates.ended_at === null
	) {
		return AttachScenario.Renew;
	}

	if (updates.options != null) {
		return AttachScenario.UpdatePrepaidQuantity;
	}

	return null;
};

const getInsertScenario = ({
	insertedProduct,
	expiredProduct,
}: {
	insertedProduct: FullCusProduct;
	expiredProduct?: FullCusProduct;
}): AttachScenario => {
	if (!expiredProduct) {
		return AttachScenario.New;
	}

	const expiredPrices = cusProductToPrices({ cusProduct: expiredProduct });
	const insertedPrices = cusProductToPrices({ cusProduct: insertedProduct });

	const isUpgrade = isProductUpgrade({
		prices1: expiredPrices,
		prices2: insertedPrices,
	});

	return isUpgrade ? AttachScenario.Upgrade : AttachScenario.New;
};

export const billingPlanToSendProductsUpdated = async ({
	ctx,
	autumnBillingPlan,
	billingContext,
	fallbackUpdateScenario,
}: {
	ctx: AutumnContext;
	autumnBillingPlan: AutumnBillingPlan;
	billingContext: { fullCustomer: FullCustomer };
	fallbackUpdateScenario?: AttachScenario;
}) => {
	if (ctx.testOptions?.skipWebhooks) return;

	const { fullCustomer } = billingContext;
	const customerId = fullCustomer.id ?? fullCustomer.internal_id;
	const { insertCustomerProducts } = autumnBillingPlan;
	const updateCustomerProducts = getUpdateCustomerProducts({
		autumnBillingPlan,
	});
	const expiredProducts = getExpiredUpdatedCustomerProducts({
		autumnBillingPlan,
	});

	for (const updateCustomerProduct of updateCustomerProducts) {
		const scenario =
			getUpdateScenario({
				updates: updateCustomerProduct.updates,
				insertCustomerProducts,
			}) ?? fallbackUpdateScenario;

		if (scenario) {
			try {
				await workflows.triggerSendProductsUpdated({
					orgId: ctx.org.id,
					env: ctx.env,
					customerId,
					customerProductId: updateCustomerProduct.customerProduct.id,
					scenario,
				});

				ctx.logger.info(
					`[billingPlanToSendProductsUpdated] Queued ${scenario} webhook for ${updateCustomerProduct.customerProduct.product.name}`,
				);
			} catch (error) {
				ctx.logger.error(
					`[billingPlanToSendProductsUpdated] Failed to queue ${scenario} webhook for ${updateCustomerProduct.customerProduct.product.name}: ${error}`,
				);
			}
		}
	}

	const activeInsertCustomerProducts = insertCustomerProducts.filter(
		(cusProduct) => !isCustomerProductScheduled(cusProduct),
	);

	for (const [index, cusProduct] of activeInsertCustomerProducts.entries()) {
		const expiredProduct = expiredProducts[index];

		const scenario = getInsertScenario({
			insertedProduct: cusProduct,
			expiredProduct,
		});

		try {
			await workflows.triggerSendProductsUpdated({
				orgId: ctx.org.id,
				env: ctx.env,
				customerId,
				customerProductId: cusProduct.id,
				scenario,
			});

			ctx.logger.info(
				`[billingPlanToSendProductsUpdated] Queued webhook for ${cusProduct.product.name}, scenario: ${scenario}`,
			);
		} catch (error) {
			ctx.logger.error(
				`[billingPlanToSendProductsUpdated] Failed to queue webhook for ${cusProduct.product.name}: ${error}`,
			);
		}
	}
};
