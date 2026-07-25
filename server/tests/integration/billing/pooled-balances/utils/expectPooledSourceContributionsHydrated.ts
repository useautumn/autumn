import { expect } from "bun:test";
import {
	type DbPooledBalanceContribution,
	findCustomerEntitlementById,
	findCustomerProductById,
} from "@autumn/shared";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { CusService } from "@/internal/customers/CusService";

export const expectPooledSourceContributionsHydrated = async ({
	ctx,
	customerId,
	contributions,
}: {
	ctx: TestContext;
	customerId: string;
	contributions: DbPooledBalanceContribution[];
}) => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		withEntities: true,
		withSubs: true,
	});

	for (const contribution of contributions) {
		const customerProduct = findCustomerProductById({
			fullCustomer,
			customerProductId: contribution.source_customer_product_id,
		});
		expect(customerProduct).toBeDefined();
		const customerEntitlement = findCustomerEntitlementById({
			cusEnts: customerProduct?.customer_entitlements ?? [],
			id: contribution.source_customer_entitlement_id,
			errorOnNotFound: true,
		});

		expect(customerEntitlement.pooled_balance_contribution).toMatchObject({
			id: contribution.id,
			pooled_balance_id: contribution.pooled_balance_id,
			source_customer_product_id: customerProduct?.id,
			source_customer_entitlement_id: customerEntitlement.id,
		});
	}
};
