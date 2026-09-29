import type { Customer } from "@autumn/shared";
import { runResetOnCustomerEntitlement } from "@tests/utils/cusProductUtils/resetTestUtils.js";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { cusProductToCusEnt } from "@/internal/customers/cusProducts/cusProductUtils/convertCusProduct.js";
import { getMainCusProduct } from "@/internal/customers/cusProducts/cusProductUtils.js";

/** Forces one reset cycle on the customer's main plan row for `featureId` (V2 cron, SQL lane) and returns the row after it. */
export const resetAndGetCusEnt = async ({
	ctx,
	customer,
	productGroup,
	featureId,
	skipCacheDeletion = false,
}: {
	ctx: TestContext;
	customer: Customer;
	productGroup: string;
	featureId: string;
	skipCacheDeletion?: boolean;
}) => {
	const { db } = ctx;
	const readCusEnt = async () => {
		const mainCusProduct = await getMainCusProduct({
			db,
			internalCustomerId: customer.internal_id,
			productGroup,
		});
		if (!mainCusProduct)
			throw new Error(
				`No main plan in group ${productGroup} for ${customer.id}`,
			);
		return cusProductToCusEnt({ cusProduct: mainCusProduct, featureId });
	};

	const cusEnt = await readCusEnt();
	if (!cusEnt) return cusEnt;

	await runResetOnCustomerEntitlement({
		ctx,
		customerId: customer.id ?? customer.internal_id,
		customerEntitlementId: cusEnt.id,
		skipCacheDeletion,
	});

	return readCusEnt();
};
