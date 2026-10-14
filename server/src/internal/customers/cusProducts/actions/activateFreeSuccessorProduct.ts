import {
	cp,
	type FullCusProduct,
	type FullCustomer,
	findMainActiveCustomerProductByGroup,
	findMainScheduledCustomerProductByGroup,
	isCustomerProductFree,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { activateFreeDefaultProduct } from "@/internal/customers/cusProducts/actions/activateFreeDefaultProduct";
import type { CustomerProductActivation } from "../types/customerProductActivation";
import { activateScheduledCustomerProduct } from "./activateScheduled";

export const activateFreeSuccessorProduct = async ({
	ctx,
	fromCustomerProduct,
	fullCustomer,
	activatedAt,
	emitsBillingUpdated = false,
}: {
	ctx: AutumnContext;
	fromCustomerProduct: FullCusProduct;
	fullCustomer: FullCustomer;
	activatedAt: number;
	emitsBillingUpdated?: boolean;
}): Promise<{
	activation?: CustomerProductActivation;
	insertedCustomerProduct?: FullCusProduct;
	allocationsAdjusted: boolean;
}> => {
	const { logger } = ctx;

	const { valid: isAddOnOrOneOff } = cp(fromCustomerProduct).addOn().oneOff();
	if (isAddOnOrOneOff) {
		logger.debug(
			`[activateFreeSuccessor] Skipping - product is add-on or one-off: ${fromCustomerProduct.product.name}`,
		);
		return { allocationsAdjusted: false };
	}

	const hasActiveInGroup = findMainActiveCustomerProductByGroup({
		fullCus: fullCustomer,
		productGroup: fromCustomerProduct.product.group,
		internalEntityId: fromCustomerProduct.internal_entity_id ?? undefined,
	});

	if (hasActiveInGroup) {
		logger.debug(
			`[activateFreeSuccessor] Skipping - another active customer product in group: ${hasActiveInGroup.product.name}`,
		);
		return { allocationsAdjusted: false };
	}

	const productGroup = fromCustomerProduct.product.group;

	const scheduledCustomerProduct = findMainScheduledCustomerProductByGroup({
		fullCustomer,
		productGroup,
		internalEntityId: fromCustomerProduct.internal_entity_id ?? undefined,
	});

	if (
		scheduledCustomerProduct &&
		isCustomerProductFree(scheduledCustomerProduct)
	) {
		const { updates, allocationsAdjusted } =
			await activateScheduledCustomerProduct({
				ctx,
				fromCustomerProduct,
				customerProduct: scheduledCustomerProduct,
				fullCustomer,
				activatedAt,
				emitsBillingUpdated,
			});
		const activatedCustomerProduct = {
			...scheduledCustomerProduct,
			...updates,
		} as FullCusProduct;

		fullCustomer.customer_products = fullCustomer.customer_products.map((cp) =>
			cp.id === scheduledCustomerProduct.id ? activatedCustomerProduct : cp,
		);

		return {
			activation: {
				before: scheduledCustomerProduct,
				after: activatedCustomerProduct,
			},
			allocationsAdjusted,
		};
	}

	const { insertedCustomerProduct: newCustomerProduct, allocationsAdjusted } =
		await activateFreeDefaultProduct({
			ctx,
			customerProduct: fromCustomerProduct,
			fullCustomer,
			emitsBillingUpdated,
		});

	if (newCustomerProduct) {
		fullCustomer.customer_products = [
			...fullCustomer.customer_products,
			newCustomerProduct,
		];
	}

	return { insertedCustomerProduct: newCustomerProduct, allocationsAdjusted };
};
