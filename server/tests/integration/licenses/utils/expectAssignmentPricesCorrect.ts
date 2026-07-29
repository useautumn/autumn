import { expect } from "bun:test";
import {
	CusProductStatus,
	customerPrices,
	PriceType,
	prices,
} from "@autumn/shared";
import { getLicenseDbState } from "@tests/integration/licenses/licenseTestUtils";
import { pollUntil } from "@tests/utils/genUtils";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { eq, inArray } from "drizzle-orm";

/** DB-side seat pricing: every live assignment's fixed price row carries the
 * expected amount — the observable contract of a uniform seat re-price. */
export const expectAssignmentPricesCorrect = async ({
	ctx,
	customerId,
	amount,
	count,
}: {
	ctx: TestContext;
	customerId: string;
	amount: number;
	count: number;
}) => {
	const { assignments } = await getLicenseDbState({
		db: ctx.db,
		customerId,
	});
	const liveAssignments = assignments.filter(
		(assignment) =>
			assignment.internal_entity_id &&
			assignment.status === CusProductStatus.Active,
	);
	expect(liveAssignments).toHaveLength(count);
	if (liveAssignments.length === 0) return;

	const seatPriceRows = await pollUntil({
		fetch: () =>
			ctx.db
				.select({
					customerProductId: customerPrices.customer_product_id,
					config: prices.config,
				})
				.from(customerPrices)
				.innerJoin(prices, eq(prices.id, customerPrices.price_id))
				.where(
					inArray(
						customerPrices.customer_product_id,
						liveAssignments.map((assignment) => assignment.id),
					),
				),
		until: (rows) =>
			liveAssignments.every((assignment) => {
				const fixedAmounts = rows
					.filter((row) => row.customerProductId === assignment.id)
					.flatMap((row) => (row.config ? [row.config] : []))
					.filter((config) => config.type === PriceType.Fixed)
					.map((config) => ("amount" in config ? config.amount : undefined));
				return fixedAmounts.length === 1 && fixedAmounts[0] === amount;
			}),
		timeoutMs: 10_000,
		intervalMs: 250,
	});

	for (const assignment of liveAssignments) {
		const fixedAmounts = seatPriceRows
			.filter((row) => row.customerProductId === assignment.id)
			.flatMap((row) => (row.config ? [row.config] : []))
			.filter((config) => config.type === PriceType.Fixed)
			.map((config) => ("amount" in config ? config.amount : undefined));

		expect(fixedAmounts, `seat ${assignment.id} bills at $${amount}`).toEqual([
			amount,
		]);
	}
};
