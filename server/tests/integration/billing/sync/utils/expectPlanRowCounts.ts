import { expect } from "bun:test";
import { CusProductStatus } from "@autumn/shared";
import { pollUntilAsserted } from "@tests/utils/genUtils";
import { WEBHOOK_SETTLE_TIMEOUT_MS } from "@tests/utils/pollableCustomerExpect";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { CusService } from "@/internal/customers/CusService";

export const expectPlanRowCounts = async ({
	ctx,
	customerId,
	productId,
	expected,
	atLeast = {},
	settleTimeoutMs = WEBHOOK_SETTLE_TIMEOUT_MS,
}: {
	ctx: TestContext;
	customerId: string;
	productId: string;
	expected: Partial<Record<CusProductStatus, number>>;
	atLeast?: Partial<Record<CusProductStatus, number>>;
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
			for (const [status, minimum] of Object.entries(atLeast)) {
				const inStatus = rows.filter((row) => row.status === status);
				expect(
					inStatus.length,
					`${productId} ${status} rows (at least)`,
				).toBeGreaterThanOrEqual(minimum);
			}
			for (const row of rows) {
				expect(row.quantity ?? 1, `${productId} row quantity`).toBe(1);
			}
		},
	});
