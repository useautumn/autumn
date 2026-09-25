import { expect } from "bun:test";
import { type CusProductStatus, RELEVANT_STATUSES } from "@autumn/shared";
import { pollUntilAsserted } from "@tests/utils/genUtils";
import { WEBHOOK_SETTLE_TIMEOUT_MS } from "@tests/utils/pollableCustomerExpect";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { CusService } from "@/internal/customers/CusService";

type ExpectedPhaseEnd = {
	productId: string;
	status: CusProductStatus;
	/** Asserted only when given; null asserts the plan has no end date. */
	endedAt?: number | null;
};

/**
 * Re-reads the customer's live rows until each expected plan carries the
 * given status and end date, and every `absent` plan has no live row.
 */
export const expectCustomerProductPhaseEnds = async ({
	ctx,
	customerId,
	expected,
	absent = [],
	absentStatuses = [],
	settleTimeoutMs = WEBHOOK_SETTLE_TIMEOUT_MS,
}: {
	ctx: TestContext;
	customerId: string;
	expected: ExpectedPhaseEnd[];
	absent?: string[];
	/** Plans that must have no live row in the given status. */
	absentStatuses?: { productId: string; status: CusProductStatus }[];
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
			return fullCustomer.customer_products;
		},
		assert: (customerProducts) => {
			for (const { productId, status, endedAt } of expected) {
				const row = customerProducts.find(
					(customerProduct) =>
						customerProduct.product_id === productId &&
						customerProduct.status === status,
				);
				expect(row, `${productId} should be ${status}`).toBeDefined();
				if (endedAt !== undefined) {
					expect(row?.ended_at, `${productId} ended_at`).toBe(endedAt);
				}
			}
			for (const productId of absent) {
				const rows = customerProducts.filter(
					(customerProduct) => customerProduct.product_id === productId,
				);
				expect(rows, `${productId} should have no live row`).toHaveLength(0);
			}
			for (const { productId, status } of absentStatuses) {
				const rows = customerProducts.filter(
					(customerProduct) =>
						customerProduct.product_id === productId &&
						customerProduct.status === status,
				);
				expect(rows, `${productId} should not be ${status}`).toHaveLength(0);
			}
		},
	});
