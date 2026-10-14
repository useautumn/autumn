import { expect, test } from "bun:test";
import type { ApiEntityV2, PagePaginatedResponse } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

type ListEntitiesResponse<T> = PagePaginatedResponse<T> & {
	total_count: number;
	total_filtered_count: number;
};

test.concurrent(
	`${chalk.yellowBright("list entities plan filter: union, dedup, versions and customer isolation")}`,
	async () => {
		const customerId = "list-entities-plan-filter";
		const otherCustomerId = `${customerId}-other`;
		const entityPrefix = `${customerId}-e`;
		const alphaEntityId = `${entityPrefix}-alpha`;
		const betaEntityId = `${entityPrefix}-beta`;
		const otherEntityId = `${entityPrefix}-other`;

		const inheritedProduct = products.base({
			id: "plan-filter-inherited",
			items: [items.dashboard(), items.monthlyMessages({ includedUsage: 100 })],
		});
		const entityProduct = products.base({
			id: "plan-filter-entity",
			items: [items.monthlyCredits({ includedUsage: 50 })],
		});
		const unattachedProduct = products.base({
			id: "plan-filter-unattached",
			items: [items.monthlyCredits({ includedUsage: 10 })],
		});

		const { autumnV1, autumnV2_1 } = await initScenario({
			customerId,
			setup: [
				s.customer(),
				s.products({
					list: [inheritedProduct, entityProduct, unattachedProduct],
				}),
			],
			actions: [s.billing.attach({ productId: inheritedProduct.id })],
		});

		for (const entityId of [alphaEntityId, betaEntityId]) {
			await autumnV2_1.entitiesV2.create({
				customer_id: customerId,
				entity_id: entityId,
				feature_id: TestFeature.Users,
				name: entityId,
			});
		}

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: entityProduct.id,
			entity_id: alphaEntityId,
		});

		await autumnV2_1.customers.delete(otherCustomerId).catch(() => {});
		await autumnV2_1.customers.create({ id: otherCustomerId });
		await autumnV1.billing.attach({
			customer_id: otherCustomerId,
			product_id: inheritedProduct.id,
		});
		await autumnV2_1.entitiesV2.create({
			customer_id: otherCustomerId,
			entity_id: otherEntityId,
			feature_id: TestFeature.Users,
			name: otherEntityId,
		});

		const list = async (body: Record<string, unknown>) => {
			await timeout(1200);
			return autumnV2_1.entitiesV2.list<ListEntitiesResponse<ApiEntityV2>>({
				limit: 50,
				keepInternalFields: true,
				...body,
			});
		};

		const unattached = await list({
			search: entityPrefix,
			plans: [{ id: unattachedProduct.id }],
		});
		expect(unattached.list).toHaveLength(0);
		expect(unattached.total_filtered_count).toBe(0);

		const union = await list({
			search: entityPrefix,
			plans: [{ id: inheritedProduct.id }, { id: entityProduct.id }],
		});
		const unionIds = union.list.map((entity) => entity.id).sort();
		expect(unionIds).toEqual(
			[alphaEntityId, betaEntityId, otherEntityId].sort(),
		);
		expect(new Set(unionIds).size).toBe(unionIds.length);
		expect(union.total_filtered_count).toBe(unionIds.length);

		const matchingVersion = await list({
			search: entityPrefix,
			plans: [{ id: entityProduct.id, versions: [1] }],
		});
		expect(matchingVersion.list.map((entity) => entity.id)).toEqual([
			alphaEntityId,
		]);
		expect(matchingVersion.total_filtered_count).toBe(1);

		const absentVersion = await list({
			search: entityPrefix,
			plans: [{ id: entityProduct.id, versions: [99] }],
		});
		expect(absentVersion.list).toHaveLength(0);
		expect(absentVersion.total_filtered_count).toBe(0);

		const scopedToCustomer = await list({
			plans: [{ id: inheritedProduct.id }],
			customer_id: customerId,
		});
		const scopedIds = scopedToCustomer.list.map((entity) => entity.id).sort();
		expect(scopedIds).toEqual([alphaEntityId, betaEntityId].sort());
		expect(scopedIds).not.toContain(otherEntityId);
		expect(scopedToCustomer.total_filtered_count).toBe(scopedIds.length);

		const scopedToOther = await list({
			plans: [{ id: inheritedProduct.id }],
			customer_id: otherCustomerId,
		});
		expect(scopedToOther.list.map((entity) => entity.id)).toEqual([
			otherEntityId,
		]);
		expect(scopedToOther.total_filtered_count).toBe(1);

		const planAndSearch = await list({
			plans: [{ id: inheritedProduct.id }],
			search: betaEntityId,
		});
		expect(planAndSearch.list.map((entity) => entity.id)).toEqual([
			betaEntityId,
		]);
		expect(planAndSearch.total_filtered_count).toBe(1);

		const planAndImpossibleSearch = await list({
			plans: [{ id: entityProduct.id }],
			search: betaEntityId,
		});
		expect(planAndImpossibleSearch.list).toHaveLength(0);
		expect(planAndImpossibleSearch.total_filtered_count).toBe(0);
	},
);
