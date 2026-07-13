import { beforeAll, describe, expect, test } from "bun:test";
import {
	ApiVersion,
	CusProductStatus,
	customerEntitlements,
	customerProducts,
	customers,
	type LimitedItem,
	ProductItemInterval,
	type ProductV2,
	ResetInterval,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { and, eq, inArray } from "drizzle-orm";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { findCustomerEntitlement } from "../utils/findCustomerEntitlement";

const CUTOFF = 10_000_000;

const autumnV1 = new AutumnInt({ version: ApiVersion.V1_2 });

const cleanupCustomers = async (customerIds: string[]) => {
	const rows = await ctx.db
		.select({ internal_id: customers.internal_id })
		.from(customers)
		.where(
			and(
				eq(customers.org_id, ctx.org.id),
				eq(customers.env, ctx.env),
				inArray(customers.id, customerIds),
			),
		);
	if (rows.length === 0) return;
	await ctx.db.delete(customerEntitlements).where(
		inArray(
			customerEntitlements.internal_customer_id,
			rows.map((r) => r.internal_id),
		),
	);
};

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
	test.concurrent(
		"a page is one SQL statement: union of 3 branches, ordered, no offset",
		() => {
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
		},
	);
});

describe(`${chalk.yellowBright("reset-keyset-pagination: exactly-once, ordering, branch merge, ties")}`, () => {
	const BAND = 1_000_000;
	const TIE = 1_050_000;
	const distinctCustomers = Array.from({ length: 5 }, (_, i) => `kpg2-d-${i}`);
	const tieCustomers = Array.from({ length: 4 }, (_, i) => `kpg2-t-${i}`);
	const ownCustomers = [
		...distinctCustomers,
		...tieCustomers,
		"kpg2-act",
		"kpg2-pd",
	];
	const legacyCustomers = [
		...Array.from({ length: 8 }, (_, i) => `keyset-pg-${i}`),
		...Array.from({ length: 4 }, (_, i) => `keyset-tie-${i}`),
		"keyset-br-active",
		"keyset-br-pd",
	];
	const seededDistinct: string[] = [];
	const seededTies: string[] = [];
	let activeId: string;
	let pastDueId: string;

	beforeAll(async () => {
		await cleanupCustomers([...ownCustomers, ...legacyCustomers]);

		for (const [i, customerId] of distinctCustomers.entries()) {
			seededDistinct.push(
				await seedLooseCusEnt({ customerId, nextResetAt: BAND + i }),
			);
		}
		for (const customerId of tieCustomers) {
			seededTies.push(await seedLooseCusEnt({ customerId, nextResetAt: TIE }));
		}
		activeId = await seedProductCusEnt({
			customerId: "kpg2-act",
			nextResetAt: BAND + 100,
			productStatus: CusProductStatus.Active,
			ignorePastDue: false,
		});
		pastDueId = await seedProductCusEnt({
			customerId: "kpg2-pd",
			nextResetAt: BAND + 101,
			productStatus: CusProductStatus.PastDue,
			ignorePastDue: true,
		});
	});

	test.concurrent(
		"multi-page fetch returns every seeded candidate exactly once, in (next_reset_at, id) order",
		async () => {
			const results = await fetchAll();

			const allSeeded = [...seededDistinct, activeId, pastDueId, ...seededTies];
			const returnedSeeded = results
				.map((ce) => ce.id)
				.filter((id) => allSeeded.includes(id));

			expect(new Set(returnedSeeded).size).toBe(allSeeded.length);

			const expectedOrder = [
				...seededDistinct,
				activeId,
				pastDueId,
				...[...seededTies].sort(),
			];
			expect(returnedSeeded).toEqual(expectedOrder);

			const activeRow = results.find((ce) => ce.id === activeId);
			const pastDueRow = results.find((ce) => ce.id === pastDueId);
			expect(activeRow?.customer_product?.status).toBe(CusProductStatus.Active);
			expect(pastDueRow?.customer_product?.status).toBe(
				CusProductStatus.PastDue,
			);
		},
	);
});

describe(`${chalk.yellowBright("reset-keyset-pagination: limit semantics")}`, () => {
	const BAND = 1_500_000;
	const ownCustomers = Array.from({ length: 7 }, (_, i) => `klim-${i}`);

	beforeAll(async () => {
		await cleanupCustomers(ownCustomers);
		for (const [i, customerId] of ownCustomers.entries()) {
			await seedLooseCusEnt({ customerId, nextResetAt: BAND + i });
		}
	});

	test.concurrent("limit stops fetching at the page boundary", async () => {
		const results = await fetchAll({ batchSize: 3, limit: 4 });
		expect(results.length).toBe(6);
	});
});

describe(`${chalk.yellowBright("reset-keyset-pagination: shrink + re-qualify mutations")}`, () => {
	const BAND = 2_000_000;
	const ownCustomers = Array.from({ length: 6 }, (_, i) => `kmta-${i}`);
	const legacyCustomers = [
		...Array.from({ length: 6 }, (_, i) => `keyset-mut-${i}`),
		...Array.from({ length: 6 }, (_, i) => `keyset-mut-a-${i}`),
	];
	const seeded: string[] = [];

	beforeAll(async () => {
		await cleanupCustomers([...ownCustomers, ...legacyCustomers]);
		for (const [i, customerId] of ownCustomers.entries()) {
			seeded.push(await seedLooseCusEnt({ customerId, nextResetAt: BAND + i }));
		}
	});

	test.concurrent(
		"a row leaving the predicate mid-run does not skip unread rows; a re-qualifying emitted row is not duplicated",
		async () => {
			let mutated = false;

			const results = await CusEntService.getActiveResetPassed({
				db: ctx.db,
				customDateUnix: CUTOFF,
				batchSize: 2,
				limit: 1_000_000,
				onPageFetched: async (page) => {
					if (mutated) return;
					if (!page.some((ce) => ce.id === seeded[0])) return;
					mutated = true;

					await setResetAt(seeded[0], CUTOFF + 1_000_000);
					await setResetAt(seeded[1], BAND + 5_000);
				},
			});

			expect(mutated).toBe(true);

			const returnedSeeded = results
				.map((ce) => ce.id)
				.filter((id) => seeded.includes(id));

			expect(new Set(returnedSeeded).size).toBe(returnedSeeded.length);
			expect([...returnedSeeded].sort()).toEqual([...seeded].sort());
		},
	);
});

describe(`${chalk.yellowBright("reset-keyset-pagination: backward cursor movement")}`, () => {
	const BAND = 2_500_000;
	const ownCustomers = Array.from({ length: 6 }, (_, i) => `kmtb-${i}`);
	const legacyCustomers = Array.from(
		{ length: 6 },
		(_, i) => `keyset-mut-b-${i}`,
	);
	const seeded: string[] = [];

	beforeAll(async () => {
		await cleanupCustomers([...ownCustomers, ...legacyCustomers]);
		for (const [i, customerId] of ownCustomers.entries()) {
			seeded.push(await seedLooseCusEnt({ customerId, nextResetAt: BAND + i }));
		}
	});

	test.concurrent(
		"a row moved backward behind the cursor is deferred to the next scan, then recovered",
		async () => {
			let mutated = false;

			const firstRun = await CusEntService.getActiveResetPassed({
				db: ctx.db,
				customDateUnix: CUTOFF,
				batchSize: 2,
				limit: 1_000_000,
				onPageFetched: async (page) => {
					if (mutated) return;
					if (!page.some((ce) => ce.id === seeded[0])) return;
					mutated = true;
					await setResetAt(seeded[4], BAND - 100);
				},
			});

			expect(mutated).toBe(true);

			const firstRunSeeded = firstRun
				.map((ce) => ce.id)
				.filter((id) => seeded.includes(id));
			expect(firstRunSeeded).not.toContain(seeded[4]);
			expect(firstRunSeeded.length).toBe(seeded.length - 1);

			const secondRun = await fetchAll({ batchSize: 2 });
			expect(secondRun.map((ce) => ce.id)).toContain(seeded[4]);
		},
	);
});
