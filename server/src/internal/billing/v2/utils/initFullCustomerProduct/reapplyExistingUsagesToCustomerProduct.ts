import {
	cusProductToProduct,
	type FullCusProduct,
	type FullCustomer,
} from "@autumn/shared";
import { cp } from "@utils/cusProductUtils/classifyCustomerProduct/cpBuilder";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { isPooledSourceCustomerEntitlement } from "@/internal/billing/v2/pooledBalances/utils/pooledCustomerEntitlementClassification.js";
import { applyExistingUsages } from "@/internal/billing/v2/utils/handleExistingUsages/applyExistingUsages";
import { cusProductToExistingUsages } from "@/internal/billing/v2/utils/handleExistingUsages/cusProductToExistingUsages";
import { initCustomerEntitlementBalance } from "@/internal/billing/v2/utils/initFullCustomerProduct/initCustomerEntitlement/initCustomerEntitlementBalance";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService";
import { findTransitionSourceCustomerProduct } from "./findTransitionSourceCustomerProduct";

export const reapplyExistingUsagesToCustomerProduct = async ({
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
	const { valid } = cp(customerProduct).main().recurring();
	if (!valid) return undefined;

	const currentCustomerProduct =
		fromCustomerProduct ??
		findTransitionSourceCustomerProduct({
			fullCustomer,
			customerProduct,
		});

	if (!currentCustomerProduct) return undefined;

	// const featuresToCarryUsagesFor = customerProductToFeaturesToCarryUsagesFor({
	// 	cusProduct: customerProduct,
	// });

	const currentUsages = cusProductToExistingUsages({
		cusProduct: currentCustomerProduct,
		entityId: customerProduct.entity_id ?? undefined,
	});

	// Reinitialize customer entitlements with reset balance
	// Use the NEW customerProduct (not currentCustomerProduct) to get the correct
	// prices and allowances for balance initialization
	const fullProduct = cusProductToProduct({
		cusProduct: customerProduct,
	});
	for (const cusEnt of customerProduct.customer_entitlements) {
		const { balance, entities } = initCustomerEntitlementBalance({
			initContext: {
				fullCustomer: fullCustomer,
				fullProduct,
				featureQuantities: customerProduct.options,
			},
			entitlement: cusEnt.entitlement,
		});

		cusEnt.balance = balance;
		cusEnt.entities = entities;
	}

	applyExistingUsages({
		ctx,
		customerProduct,
		existingUsages: currentUsages,
		entities: fullCustomer.entities,
	});

	for (const cusEnt of customerProduct.customer_entitlements) {
		if (
			isPooledSourceCustomerEntitlement({
				customerEntitlement: cusEnt,
				customerProduct,
			})
		)
			continue;
		await CusEntService.update({
			ctx,
			id: cusEnt.id,
			updates: {
				balance: cusEnt.balance ?? 0,
				entities: cusEnt.entities,
			},
		});
	}

	return currentCustomerProduct;
};
