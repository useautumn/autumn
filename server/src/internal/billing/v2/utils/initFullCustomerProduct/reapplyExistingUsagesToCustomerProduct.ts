import {
	cusProductToProduct,
	type FullCusProduct,
	type FullCustomer,
	findMainActiveCustomerProductByGroup,
} from "@autumn/shared";
import { customerProductToFeaturesToCarryUsagesFor } from "@shared/utils/cusProductUtils/convertCusProduct/customerProductToFeaturesToCarryUsagesFor";
import { cp } from "@utils/cusProductUtils/classifyCustomerProduct/cpBuilder";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { applyExistingUsages } from "@/internal/billing/v2/utils/handleExistingUsages/applyExistingUsages";
import { cusProductToExistingUsages } from "@/internal/billing/v2/utils/handleExistingUsages/cusProductToExistingUsages";
import { initCustomerEntitlementBalance } from "@/internal/billing/v2/utils/initFullCustomerProduct/initCustomerEntitlement/initCustomerEntitlementBalance";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService";

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
	const { db } = ctx;
	const { valid } = cp(customerProduct).main().recurring();
	if (!valid) return;

	const currentCustomerProduct =
		fromCustomerProduct ??
		findMainActiveCustomerProductByGroup({
			fullCus: fullCustomer,
			productGroup: customerProduct.product.group,
			internalEntityId: customerProduct.internal_entity_id ?? undefined,
		});

	if (!currentCustomerProduct) return;

	const featuresToCarryUsagesFor = customerProductToFeaturesToCarryUsagesFor({
		cusProduct: customerProduct,
	});

	const currentUsages = cusProductToExistingUsages({
		cusProduct: currentCustomerProduct,
		entityId: customerProduct.entity_id ?? undefined,
		featureIds: [], // reset all consumable features
	});

	// Reinitialize customer entitlements with reset balance
	const fullProduct = cusProductToProduct({
		cusProduct: currentCustomerProduct,
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
		await CusEntService.update({
			db,
			id: cusEnt.id,
			updates: {
				balance: cusEnt.balance ?? 0,
				entities: cusEnt.entities,
			},
		});
	}
};
