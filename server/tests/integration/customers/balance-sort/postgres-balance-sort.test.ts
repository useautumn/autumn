import { expect, test } from "bun:test";
import { AppEnv, customers } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { inArray } from "drizzle-orm";
import { getBalanceCandidateSource } from "@/internal/customers/balanceCandidates/getBalanceCandidateSource.js";
import {
	countCustomersByBalanceFilter,
	resolveInternalIdsByBalanceFilter,
} from "@/internal/customers/resolveByBalanceFilter.js";
import { resolveInternalIdsByFeatureBalanceSort } from "@/internal/customers/resolveByFeatureBalanceSort.js";

test.concurrent(
	`${chalk.yellowBright("balance sort and filter run on the Postgres candidate source outside production")}`,
	async () => {
		const prefix = "pg-balance-sort";
		const startedAt = Date.now() - 1_000;
		const high = products.base({
			id: "pg-sort-high",
			items: [items.monthlyMessages({ includedUsage: 300 })],
		});
		const mid = products.base({
			id: "pg-sort-mid",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const low = products.base({
			id: "pg-sort-low",
			items: [items.monthlyMessages({ includedUsage: 20 })],
		});

		const { ctx } = await initScenario({
			customerId: prefix,
			setup: [
				s.customer({ testClock: false }),
				s.otherCustomers([{ id: `${prefix}-mid` }, { id: `${prefix}-low` }]),
				s.products({ list: [high, mid, low] }),
			],
			actions: [
				s.billing.attach({ productId: high.id }),
				s.billing.attach({ productId: mid.id, customerId: `${prefix}-mid` }),
				s.billing.attach({ productId: low.id, customerId: `${prefix}-low` }),
			],
		});

		expect(getBalanceCandidateSource().backend).toBe("postgres");

		const feature = ctx.features.find((f) => f.id === TestFeature.Messages);
		if (!feature) throw new Error("messages feature missing");
		const scope = {
			db: ctx.db,
			orgId: ctx.org.id,
			env: AppEnv.Sandbox,
			search: prefix,
			filters: { created_at_range: { start: startedAt } },
			internalFeatureId: feature.internal_id,
		};

		const idsOf = async (internalIds: string[]) => {
			const rows = await ctx.db
				.select({ internalId: customers.internal_id, id: customers.id })
				.from(customers)
				.where(inArray(customers.internal_id, internalIds));
			const byInternalId = new Map(rows.map((row) => [row.internalId, row.id]));
			return internalIds.map((internalId) => byInternalId.get(internalId));
		};

		const desc = await resolveInternalIdsByFeatureBalanceSort({
			...scope,
			limit: 10,
			sortOrder: "desc",
		});
		expect(desc.rows.map((row) => row.total)).toEqual([300, 100, 20]);
		expect(await idsOf(desc.rows.map((row) => row.internalId))).toEqual([
			prefix,
			`${prefix}-mid`,
			`${prefix}-low`,
		]);

		const asc = await resolveInternalIdsByFeatureBalanceSort({
			...scope,
			limit: 10,
			sortOrder: "asc",
		});
		expect(asc.rows.map((row) => row.total)).toEqual([20, 100, 300]);

		const firstPage = await resolveInternalIdsByFeatureBalanceSort({
			...scope,
			limit: 2,
			sortOrder: "desc",
		});
		expect(firstPage.hasMore).toBe(true);
		const last = firstPage.rows[1];
		const secondPage = await resolveInternalIdsByFeatureBalanceSort({
			...scope,
			limit: 2,
			sortOrder: "desc",
			cursor: {
				v: 0,
				u: last.isUnlimited,
				b: last.total,
				id: last.internalId,
			},
		});
		expect(secondPage.rows.map((row) => row.total)).toEqual([20]);

		const balance = {
			feature_id: TestFeature.Messages,
			op: "<" as const,
			value: 150,
			basis: "remaining" as const,
		};
		const filtered = await resolveInternalIdsByBalanceFilter({
			...scope,
			balance,
			limit: 10,
		});
		expect((await idsOf(filtered.internalIds)).sort()).toEqual([
			`${prefix}-low`,
			`${prefix}-mid`,
		]);
		expect(await countCustomersByBalanceFilter({ ...scope, balance })).toEqual({
			totalCount: 2,
			approximate: false,
		});
	},
);
