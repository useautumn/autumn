import { type FullCusProduct, type FullCustomer } from "@autumn/shared";
import { cp } from "@utils/cusProductUtils/classifyCustomerProduct/cpBuilder";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { applyExistingRollovers } from "@/internal/billing/v2/utils/handleExistingRollovers/applyExistingRollovers";
import { cusProductToExistingRollovers } from "@/internal/billing/v2/utils/handleExistingRollovers/cusProductToExistingRollovers";
import { RolloverService } from "@/internal/customers/cusProducts/cusEnts/cusRollovers/RolloverService";
import { findTransitionSourceCustomerProduct } from "./findTransitionSourceCustomerProduct";

export const reapplyExistingRolloversToCustomerProduct = async ({
	ctx,
	fullCustomer,
	fromCustomerProduct,
	customerProduct,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	fromCustomerProduct?: FullCusProduct;
	customerProduct: FullCusProduct;
}) => {
	const { db } = ctx;
	const { valid } = cp(customerProduct).main().recurring();
	if (!valid) return;

	const currentCustomerProduct =
		fromCustomerProduct ??
		findTransitionSourceCustomerProduct({
			fullCustomer,
			customerProduct,
		});

	if (!currentCustomerProduct) return;

	const currentRollovers = cusProductToExistingRollovers({
		cusProduct: currentCustomerProduct,
	});

	// Reinitialize customer entitlements with reset balance
	applyExistingRollovers({
		customerProduct,
		existingRollovers: currentRollovers,
	});

	try {
		for (const cusEnt of customerProduct.customer_entitlements) {
			await RolloverService.insert({
				ctx,
				rows: cusEnt.rollovers,
				fullCusEnt: { ...cusEnt, customer_product: customerProduct },
			});
		}
	} catch (error) {
		ctx.logger.error(
			`[reapplyExistingRolloversToCustomerProduct] Failed to reapply existing rollovers to customer product: ${customerProduct.id}, ${error}`,
		);
	}
};
