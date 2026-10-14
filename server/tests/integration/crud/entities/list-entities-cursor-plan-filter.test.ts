import { expect, test } from "bun:test";
import type { ApiEntityV2, CursorPaginatedResponse } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("list entities cursor plan filter: union, dedup, paging and customer isolation")}`,
	async () => {
		const customerId = "list-entities-cursor-plan";
		const otherCustomerId = `${customerId}-other`;
		const entityPrefix = `${customerId}-e`;
		const alphaEntityId = `${entityPrefix}-alpha`;
		const betaEntityId = `${entityPrefix}-beta`;
		const gammaEntityId = `${entityPrefix}-gamma`;
		const otherEntityId = `${entityPrefix}-other`;

		const inheritedProduct = products.base({
			id: "cursor-plan-inherited",
			items: [items.dashboard(), items.monthlyMessages({ includedUsage: 100 })],
		});
		const entityProduct = products.base({
			id: "cursor-plan-entity",
			items: [items.monthlyCredits({ includedUsage: 50 })],
		});
		const unattachedProduct = products.base({
			id: "cursor-plan-unattached",
			items: [items.monthlyCredits({ includedUsage: 10 })],
		});

		const { autumnV1, autumnV2_1, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer(),
				s.products({
					list: [inheritedProduct, entityProduct, unattachedProduct],
				}),
			],
			actions: [s.billing.attach({ productId: inheritedProduct.id })],
		});

		for (const entityId of [alphaEntityId, betaEntityId, gammaEntityId]) {
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
			return autumnV2_3.entitiesV2.list<CursorPaginatedResponse<ApiEntityV2>>({
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
		expect(unattached.next_cursor).toBeNull();

		const union = await list({
			search: entityPrefix,
			plans: [{ id: inheritedProduct.id }, { id: entityProduct.id }],
		});
		const unionIds = union.list.map((entity) => entity.id).sort();
		expect(unionIds).toEqual(
			[alphaEntityId, betaEntityId, gammaEntityId, otherEntityId].sort(),
		);
		expect(new Set(unionIds).size).toBe(unionIds.length);

		const matchingVersion = await list({
			search: entityPrefix,
			plans: [{ id: entityProduct.id, versions: [1] }],
		});
		expect(matchingVersion.list.map((entity) => entity.id)).toEqual([
			alphaEntityId,
		]);

		const absentVersion = await list({
			search: entityPrefix,
			plans: [{ id: entityProduct.id, versions: [99] }],
		});
		expect(absentVersion.list).toHaveLength(0);

		const scopedToCustomer = await list({
			plans: [{ id: inheritedProduct.id }],
			customer_id: customerId,
		});
		const scopedIds = scopedToCustomer.list.map((entity) => entity.id).sort();
		expect(scopedIds).toEqual(
			[alphaEntityId, betaEntityId, gammaEntityId].sort(),
		);
		expect(scopedIds).not.toContain(otherEntityId);

		const scopedToOther = await list({
			plans: [{ id: inheritedProduct.id }],
			customer_id: otherCustomerId,
		});
		expect(scopedToOther.list.map((entity) => entity.id)).toEqual([
			otherEntityId,
		]);

		const planAndSearch = await list({
			plans: [{ id: inheritedProduct.id }],
			search: betaEntityId,
		});
		expect(planAndSearch.list.map((entity) => entity.id)).toEqual([
			betaEntityId,
		]);

		const paged: (string | null)[] = [];
		let cursor: string | null = null;
		for (let page = 0; page < 6; page++) {
			const response: CursorPaginatedResponse<ApiEntityV2> = await list({
				plans: [{ id: inheritedProduct.id }],
				customer_id: customerId,
				limit: 1,
				...(cursor ? { start_cursor: cursor } : {}),
			});
			paged.push(...response.list.map((entity) => entity.id));
			cursor = response.next_cursor;
			if (!cursor) break;
		}

		expect(paged.sort()).toEqual(
			[alphaEntityId, betaEntityId, gammaEntityId].sort(),
		);
		expect(new Set(paged).size).toBe(paged.length);
	},
);
