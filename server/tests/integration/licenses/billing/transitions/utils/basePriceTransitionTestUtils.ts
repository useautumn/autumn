import { expect } from "bun:test";
import {
	BillingInterval,
	customerPrices,
	PriceType,
	prices,
} from "@autumn/shared";
import { listLicenseAssignments } from "@tests/integration/licenses/licenseTestUtils";
import { pollUntil } from "@tests/utils/genUtils";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { eq, inArray } from "drizzle-orm";
import type { AutumnInt } from "@/external/autumn/autumnCli";

export const licensePricePatch = ({
	licensePlanId,
	amount,
}: {
	licensePlanId: string;
	amount: number | null;
}) => [
	{
		license_plan_id: licensePlanId,
		customize: {
			price:
				amount === null ? null : { amount, interval: BillingInterval.Month },
		},
	},
];

export const expectAssignmentBasePrices = async ({
	ctx,
	autumn,
	customerId,
	licensePlanId,
	amount,
	count,
}: {
	ctx: TestContext;
	autumn: AutumnInt;
	customerId: string;
	licensePlanId: string;
	amount: number | null;
	count: number;
}) => {
	const assignments = await pollUntil({
		fetch: () =>
			listLicenseAssignments({
				autumn,
				customerId,
				licensePlanId,
				active: true,
			}),
		until: (rows) => rows.length === count,
		timeoutMs: 10_000,
		intervalMs: 250,
	});
	const assignmentIds = assignments.map(({ id }) => id);
	const rows = await pollUntil({
		fetch: () =>
			ctx.db
				.select({
					customerProductId: customerPrices.customer_product_id,
					config: prices.config,
				})
				.from(customerPrices)
				.innerJoin(prices, eq(prices.id, customerPrices.price_id))
				.where(inArray(customerPrices.customer_product_id, assignmentIds)),
		until: (candidateRows) =>
			assignments.every((assignment) => {
				const amounts = candidateRows
					.filter((row) => row.customerProductId === assignment.id)
					.flatMap((row) => (row.config ? [row.config] : []))
					.filter((config) => config.type === PriceType.Fixed)
					.map((config) => ("amount" in config ? config.amount : undefined));
				return amount === null
					? amounts.length === 0
					: amounts.length === 1 && amounts[0] === amount;
			}),
		timeoutMs: 10_000,
		intervalMs: 250,
	});

	for (const assignment of assignments) {
		const amounts = rows
			.filter((row) => row.customerProductId === assignment.id)
			.flatMap((row) => (row.config ? [row.config] : []))
			.filter((config) => config.type === PriceType.Fixed)
			.map((config) => ("amount" in config ? config.amount : undefined));
		expect(amounts).toEqual(amount === null ? [] : [amount]);
	}
	return assignments;
};

export const expectAssignmentBasePriceAmounts = async ({
	ctx,
	expected,
}: {
	ctx: TestContext;
	expected: Map<string, number>;
}) => {
	const rows = await pollUntil({
		fetch: () =>
			ctx.db
				.select({
					customerProductId: customerPrices.customer_product_id,
					config: prices.config,
				})
				.from(customerPrices)
				.innerJoin(prices, eq(prices.id, customerPrices.price_id))
				.where(
					inArray(customerPrices.customer_product_id, [...expected.keys()]),
				),
		until: (candidateRows) =>
			[...expected].every(([customerProductId, amount]) =>
				candidateRows.some(
					(row) =>
						row.customerProductId === customerProductId &&
						row.config?.type === PriceType.Fixed &&
						"amount" in row.config &&
						row.config.amount === amount,
				),
			),
		timeoutMs: 10_000,
		intervalMs: 250,
	});

	for (const [customerProductId, amount] of expected) {
		const fixedAmounts = rows
			.filter((row) => row.customerProductId === customerProductId)
			.flatMap((row) => (row.config ? [row.config] : []))
			.filter((config) => config.type === PriceType.Fixed)
			.map((config) => ("amount" in config ? config.amount : undefined));
		expect(fixedAmounts).toEqual([amount]);
	}
};
