import { beforeAll, describe, expect, test } from "bun:test";
import {
	ApiVersion,
	CusProductStatus,
	customerEntitlements,
	customerProducts,
	type LimitedItem,
	ProductItemInterval,
	type ProductV2,
	ResetInterval,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { findCustomerEntitlement } from "../utils/findCustomerEntitlement";

const autumnV1 = new AutumnInt({ version: ApiVersion.V1_2 });

const seedLooseCusEnt = async ({
	customerId,
	nextResetAt,
}: {
	customerId: string;
	nextResetAt: number;
}) => {
	await initCustomerV3({ ctx, customerId, withTestClock: false });
	await autumnV1.balances.create({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		granted_balance: 100,
		reset: { interval: ResetInterval.Month },
	});
	const cusEnt = await findCustomerEntitlement({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});
	expect(cusEnt).toBeDefined();
	await ctx.db
		.update(customerEntitlements)
		.set({ next_reset_at: nextResetAt })
		.where(eq(customerEntitlements.id, cusEnt!.id));
	return cusEnt!.id;
};

const seedProductCusEnt = async ({
	customerId,
	nextResetAt,
	productStatus,
	ignorePastDue,
}: {
	customerId: string;
	nextResetAt: number;
	productStatus: CusProductStatus;
	ignorePastDue: boolean;
}) => {
	const item = constructFeatureItem({
		featureId: TestFeature.Messages,
		includedUsage: 100,
		interval: ProductItemInterval.Month,
	}) as LimitedItem;
	const product = constructProduct({
		items: [item],
		type: "free",
		isDefault: false,
	}) as ProductV2;
	product.config = { ignore_past_due: ignorePastDue };

	await initProductsV0({
		ctx,
		products: [product],
		prefix: customerId,
		customerId,
	});
	await initCustomerV3({ ctx, customerId, withTestClock: false });
	await autumnV1.attach({ customer_id: customerId, product_id: product.id });

	const cusEnt = await findCustomerEntitlement({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});
	expect(cusEnt?.customer_product_id).toBeDefined();

	await ctx.db
		.update(customerEntitlements)
		.set({ next_reset_at: nextResetAt })
		.where(eq(customerEntitlements.id, cusEnt!.id));
	await ctx.db
		.update(customerProducts)
		.set({ status: productStatus })
		.where(eq(customerProducts.id, cusEnt!.customer_product_id!));
	return cusEnt!.id;
};

describe(`${chalk.yellowBright("reset-keyset-pagination: exactly-once, ordering, branch merge, ties")}`, () => {
	const BASE = 1_000_000;
	const TIE = 2_000_000;
	const seededDistinct: string[] = [];
	const seededTies: string[] = [];
	let activeId: string;
	let pastDueId: string;

	beforeAll(async () => {
		for (let i = 0; i < 5; i++) {
			seededDistinct.push(
				await seedLooseCusEnt({
					customerId: `keyset-pg-${i}`,
					nextResetAt: BASE + i,
				}),
			);
		}
		for (let i = 0; i < 4; i++) {
			seededTies.push(
				await seedLooseCusEnt({
					customerId: `keyset-tie-${i}`,
					nextResetAt: TIE,
				}),
			);
		}
		activeId = await seedProductCusEnt({
			customerId: "keyset-br-active",
			nextResetAt: BASE + 100,
			productStatus: CusProductStatus.Active,
			ignorePastDue: false,
		});
		pastDueId = await seedProductCusEnt({
			customerId: "keyset-br-pd",
			nextResetAt: BASE + 101,
			productStatus: CusProductStatus.PastDue,
			ignorePastDue: true,
		});
	});

	test("multi-page fetch returns every branch's candidates exactly once, incl. equal-timestamp pages", async () => {
		const results = await CusEntService.getActiveResetPassed({
			db: ctx.db,
			batchSize: 3,
			limit: 1_000_000,
		});

		const allSeeded = [...seededDistinct, ...seededTies, activeId, pastDueId];
		const returnedSeeded = results
			.map((ce) => ce.id)
			.filter((id) => allSeeded.includes(id));

		expect(returnedSeeded.length).toBe(allSeeded.length);
		expect(new Set(returnedSeeded).size).toBe(allSeeded.length);

		const activeRow = results.find((ce) => ce.id === activeId);
		const pastDueRow = results.find((ce) => ce.id === pastDueId);
		expect(activeRow?.customer_product?.status).toBe(CusProductStatus.Active);
		expect(pastDueRow?.customer_product?.status).toBe(CusProductStatus.PastDue);
	});

	test("results are ordered by (next_reset_at, id) across pages", async () => {
		const results = await CusEntService.getActiveResetPassed({
			db: ctx.db,
			batchSize: 3,
			limit: 1_000_000,
		});

		for (let i = 1; i < results.length; i++) {
			const prev = results[i - 1];
			const curr = results[i];
			const prevKey = Number(prev.next_reset_at);
			const currKey = Number(curr.next_reset_at);
			const ordered =
				prevKey < currKey || (prevKey === currKey && prev.id <= curr.id);
			expect(ordered).toBe(true);
		}
	});

	test("limit stops fetching at the page boundary", async () => {
		const results = await CusEntService.getActiveResetPassed({
			db: ctx.db,
			batchSize: 3,
			limit: 4,
		});

		expect(results.length).toBeGreaterThanOrEqual(4);
		expect(results.length).toBeLessThanOrEqual(6);
	});
});

describe(`${chalk.yellowBright("reset-keyset-pagination: mid-pagination mutations")}`, () => {
	const MUT_BASE = 500_000;
	const seeded: string[] = [];

	beforeAll(async () => {
		for (let i = 0; i < 6; i++) {
			seeded.push(
				await seedLooseCusEnt({
					customerId: `keyset-mut-${i}`,
					nextResetAt: MUT_BASE + i,
				}),
			);
		}
	});

	test("a re-qualifying emitted row is not duplicated; a concurrently-reset row is skipped", async () => {
		let mutated = false;

		const results = await CusEntService.getActiveResetPassed({
			db: ctx.db,
			batchSize: 2,
			limit: 1_000_000,
			onPageFetched: async (page) => {
				if (mutated) return;
				const emittedSeeded = page.find((ce) => seeded.includes(ce.id));
				if (!emittedSeeded) return;
				mutated = true;

				await ctx.db
					.update(customerEntitlements)
					.set({ next_reset_at: MUT_BASE + 5000 })
					.where(eq(customerEntitlements.id, emittedSeeded.id));

				const unemitted = seeded.find((id) => !page.some((ce) => ce.id === id));
				expect(unemitted).toBeDefined();
				await ctx.db
					.update(customerEntitlements)
					.set({ next_reset_at: Date.now() + 86_400_000 })
					.where(eq(customerEntitlements.id, unemitted!));
			},
		});

		expect(mutated).toBe(true);

		const returnedSeeded = results
			.map((ce) => ce.id)
			.filter((id) => seeded.includes(id));

		expect(new Set(returnedSeeded).size).toBe(returnedSeeded.length);
		expect(returnedSeeded.length).toBe(seeded.length - 1);
	});
});
