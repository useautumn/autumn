import { expect } from "bun:test";
import {
	ALL_STATUSES,
	type CusProductStatus,
	type FullCustomer,
} from "@autumn/shared";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { CusService } from "@/internal/customers/CusService.js";

/** Gets full customer including expired products. */
export const getFullCustomerWithExpired = async (
	customerId: string,
): Promise<FullCustomer> => {
	return await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		inStatuses: ALL_STATUSES,
	});
};

/**
 * Verify customer products have expected statuses in creation order.
 * @param fullCus - Full customer object
 * @param productId - Product ID to filter by
 * @param expectedStatuses - Array of expected statuses in order (index 0 = oldest product)
 */
export const expectProductStatusesByOrder = ({
	fullCus,
	productId,
	expectedStatuses,
}: {
	fullCus: FullCustomer;
	productId: string;
	expectedStatuses: CusProductStatus[];
}): void => {
	const cusProducts = fullCus.customer_products
		.filter((cp) => cp.product.id === productId)
		.sort((a, b) => (a.created_at ?? 0) - (b.created_at ?? 0));

	expect(cusProducts.length).toBe(expectedStatuses.length);

	for (let i = 0; i < expectedStatuses.length; i++) {
		expect(cusProducts[i].status).toBe(expectedStatuses[i]);
	}
};
