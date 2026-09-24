import { expect } from "bun:test";
import { type CusProductStatus, RELEVANT_STATUSES } from "@autumn/shared";
import { pollUntilAsserted } from "@tests/utils/genUtils";
import { WEBHOOK_SETTLE_TIMEOUT_MS } from "@tests/utils/pollableCustomerExpect";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { CusService } from "@/internal/customers/CusService";

/** Re-reads the customer until exactly one row of the plan in the given status carries the quantity. */
export const expectCustomerProductQuantity = async ({
	ctx,
	customerId,
	productId,
	status,
	quantity,
	settleTimeoutMs = WEBHOOK_SETTLE_TIMEOUT_MS,
}: {
	ctx: TestContext;
	customerId: string;
	productId: string;
	status: CusProductStatus;
	quantity: number;
	settleTimeoutMs?: number;
}) =>
	pollUntilAsserted({
		timeoutMs: settleTimeoutMs,
		fetch: async () => {
			const fullCustomer = await CusService.getFull({
				ctx,
				idOrInternalId: customerId,
				inStatuses: RELEVANT_STATUSES,
			});
			return fullCustomer.customer_products.filter(
				(customerProduct) =>
					customerProduct.product_id === productId &&
					customerProduct.status === status,
			);
		},
		assert: (rows) => {
			expect(rows, `${productId} should have one ${status} row`).toHaveLength(
				1,
			);
			expect(rows[0]?.quantity, `${productId} quantity`).toBe(quantity);
		},
	});
