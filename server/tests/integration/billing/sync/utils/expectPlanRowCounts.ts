import { expect } from "bun:test";
import { CusProductStatus } from "@autumn/shared";
import { pollUntilAsserted } from "@tests/utils/genUtils";
import { WEBHOOK_SETTLE_TIMEOUT_MS } from "@tests/utils/pollableCustomerExpect";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { CusService } from "@/internal/customers/CusService";

/** Re-reads the customer until the plan has exactly the given number of rows per status, each at quantity 1. */
export const expectPlanRowCounts = async ({
	ctx,
	customerId,
	productId,
	expected,
	settleTimeoutMs = WEBHOOK_SETTLE_TIMEOUT_MS,
}: {
	ctx: TestContext;
	customerId: string;
	productId: string;
	expected: Partial<Record<CusProductStatus, number>>;
	settleTimeoutMs?: number;
}) =>
	pollUntilAsserted({
		timeoutMs: settleTimeoutMs,
		fetch: async () => {
			const fullCustomer = await CusService.getFull({
				ctx,
				idOrInternalId: customerId,
				inStatuses: [
					CusProductStatus.Active,
					CusProductStatus.PastDue,
					CusProductStatus.Scheduled,
					CusProductStatus.Expired,
				],
			});
			return fullCustomer.customer_products.filter(
				(customerProduct) => customerProduct.product_id === productId,
			);
		},
		assert: (rows) => {
			for (const [status, count] of Object.entries(expected)) {
				const inStatus = rows.filter((row) => row.status === status);
				expect(inStatus, `${productId} ${status} rows`).toHaveLength(count);
			}
			for (const row of rows) {
				expect(row.quantity ?? 1, `${productId} row quantity`).toBe(1);
			}
		},
	});
