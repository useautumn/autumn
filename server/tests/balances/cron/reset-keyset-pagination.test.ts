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
import { eq, lt } from "drizzle-orm";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { findCustomerEntitlement } from "../utils/findCustomerEntitlement";

const CUTOFF = 10_000_000;

const autumnV1 = new AutumnInt({ version: ApiVersion.V1_2 });

beforeAll(async () => {
	await ctx.db
		.delete(customerEntitlements)
		.where(lt(customerEntitlements.next_reset_at, CUTOFF));
});

const setResetAt = async (cusEntId: string, nextResetAt: number) => {
	await ctx.db
		.update(customerEntitlements)
		.set({ next_reset_at: nextResetAt })
		.where(eq(customerEntitlements.id, cusEntId));
};

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
	await setResetAt(cusEnt!.id, nextResetAt);
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

	await setResetAt(cusEnt!.id, nextResetAt);
	await ctx.db
		.update(customerProducts)
		.set({ status: productStatus })
		.where(eq(customerProducts.id, cusEnt!.customer_product_id!));
	return cusEnt!.id;
};

const fetchAll = (opts?: { batchSize?: number; limit?: number }) =>
	CusEntService.getActiveResetPassed({
		db: ctx.db,
		customDateUnix: CUTOFF,
		batchSize: opts?.batchSize ?? 3,
		limit: opts?.limit ?? 1_000_000,
	});

describe(`${chalk.yellowBright("reset-keyset-pagination: single-statement page shape")}`, () => {
	test("a page is one SQL statement: union of 3 branches, ordered, no offset", () => {
		const query = CusEntService.buildActiveResetPassedPage({
			db: ctx.db,
			now: CUTOFF,
			batchSize: 5,
			cursor: { nextResetAt: 1, id: "cus_ent_x" },
			includeSeparateIntervalResets: false,
		});
		const text = query.toSQL().sql.toLowerCase();

		expect((text.match(/union all/g) ?? []).length).toBe(2);
		expect(text).toContain('order by "sort_reset", "sort_id"');
		expect(text).toContain("limit");
		expect(text).not.toContain("offset");
	});
});

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

	test("multi-page fetch returns exactly the seeded candidates, every branch, exactly once", async () => {
		const results = await fetchAll();

		const expected = [
			...seededDistinct,
			activeId,
			pastDueId,
			...[...seededTies].sort(),
		];

		expect(results.map((ce) => ce.id)).toEqual(expected);

		const activeRow = results.find((ce) => ce.id === activeId);
		const pastDueRow = results.find((ce) => ce.id === pastDueId);
		expect(activeRow?.customer_product?.status).toBe(CusProductStatus.Active);
		expect(pastDueRow?.customer_product?.status).toBe(CusProductStatus.PastDue);
	});

	test("limit stops fetching at the page boundary", async () => {
		const results = await fetchAll({ batchSize: 3, limit: 4 });
		expect(results.length).toBe(6);
	});
});

describe(`${chalk.yellowBright("reset-keyset-pagination: mid-pagination mutations")}`, () => {
	const A_BASE = 500_000;
	const B_BASE = 700_000;
	const seededA: string[] = [];
	const seededB: string[] = [];

	beforeAll(async () => {
		for (let i = 0; i < 6; i++) {
			seededA.push(
				await seedLooseCusEnt({
					customerId: `keyset-mut-a-${i}`,
					nextResetAt: A_BASE + i,
				}),
			);
		}
		for (let i = 0; i < 6; i++) {
			seededB.push(
				await seedLooseCusEnt({
					customerId: `keyset-mut-b-${i}`,
					nextResetAt: B_BASE + i,
				}),
			);
		}
	});

	test("shrinking result set does not skip unread rows; re-qualifying emitted row is not duplicated", async () => {
		let mutated = false;

		const results = await CusEntService.getActiveResetPassed({
			db: ctx.db,
			customDateUnix: CUTOFF,
			batchSize: 2,
			limit: 1_000_000,
			onPageFetched: async (page) => {
				if (mutated) return;
				mutated = true;

				expect(page.map((ce) => ce.id)).toEqual([seededA[0], seededA[1]]);

				await setResetAt(seededA[0], CUTOFF + 1_000_000);
				await setResetAt(seededA[1], 600_000);
			},
		});

		expect(mutated).toBe(true);

		const returnedA = results
			.map((ce) => ce.id)
			.filter((id) => seededA.includes(id));

		expect(new Set(returnedA).size).toBe(returnedA.length);
		expect([...returnedA].sort()).toEqual([...seededA].sort());
	});

	test("a row moved backward behind the cursor is deferred to the next scan, then recovered", async () => {
		let mutated = false;

		const firstRun = await CusEntService.getActiveResetPassed({
			db: ctx.db,
			customDateUnix: CUTOFF,
			batchSize: 2,
			limit: 1_000_000,
			onPageFetched: async (page) => {
				if (mutated) return;
				if (!page.some((ce) => ce.id === seededB[0])) return;
				mutated = true;
				await setResetAt(seededB[4], 400_000);
			},
		});

		expect(mutated).toBe(true);

		const firstRunB = firstRun
			.map((ce) => ce.id)
			.filter((id) => seededB.includes(id));
		expect(firstRunB).not.toContain(seededB[4]);
		expect(firstRunB.length).toBe(seededB.length - 1);

		const secondRun = await fetchAll({ batchSize: 2 });
		expect(secondRun.map((ce) => ce.id)).toContain(seededB[4]);
	});
});
