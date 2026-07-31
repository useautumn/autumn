/**
 * Contract coverage for the `plans` filter on entities.list.
 *
 * Complements list-entities.test.ts, which covers the two basic matches
 * (inherited customer-level, and entity-level). This file covers the edges that
 * the plan_scopes rewrite in getPaginatedEntitySubjectsQuery /
 * countEntitiesMatchingPlans could plausibly break:
 *
 *   Behaviors:
 *     - a plan nobody holds -> empty page, total_filtered_count 0
 *     - multiple plans -> union (OR), each entity appearing exactly ONCE even
 *       when it matches via BOTH a customer-level and an entity-level product
 *     - versions:[matching] -> included; versions:[absent] -> excluded
 *     - plans + customer_id -> intersection, never another customer's entities
 *     - plans + search -> intersection
 *     - total_filtered_count agrees with the number of entities actually listed
 *
 * The dedup case is the important one: plan_scopes emits a customer-level row
 * for a matching customer and drops that customer's entity-level rows, so the
 * join stays 1:1. If that collapses wrongly, an entity that matches two ways
 * comes back duplicated and total_filtered_count disagrees with the list.
 *
 * The isolation case is the second: plan_scopes joins on internal_customer_id,
 * so a scoping mistake there leaks a different customer's entities into the page.
 */

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

		// Attached to the CUSTOMER, so it covers every one of their entities.
		const inheritedProduct = products.base({
			id: "plan-filter-inherited",
			items: [items.dashboard(), items.monthlyMessages({ includedUsage: 100 })],
		});
		// Attached to a single ENTITY.
		const entityProduct = products.base({
			id: "plan-filter-entity",
			items: [items.monthlyCredits({ includedUsage: 50 })],
		});
		// Created but never attached to anyone.
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

		// alpha now matches inheritedProduct (via customer) AND entityProduct
		// (directly) — the dedup case.
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: entityProduct.id,
			entity_id: alphaEntityId,
		});

		// A second customer holding the SAME inherited plan, to prove scope
		// isolation rather than assuming it. initScenario only owns customerId,
		// so this one has to be cleared explicitly or a re-run collides on the
		// deterministic id.
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

		// entities.list sits under the ListCustomers rate limiter, and this test
		// makes ~8 calls back to back — space them or the run dies mid-suite.
		const list = async (body: Record<string, unknown>) => {
			await timeout(1200);
			return autumnV2_1.entitiesV2.list<ListEntitiesResponse<ApiEntityV2>>({
				limit: 50,
				keepInternalFields: true,
				...body,
			});
		};

		// ── A plan nobody holds returns nothing ───────────────────────────
		const unattached = await list({
			search: entityPrefix,
			plans: [{ id: unattachedProduct.id }],
		});
		expect(unattached.list).toHaveLength(0);
		expect(unattached.total_filtered_count).toBe(0);

		// ── Union across plans, with alpha matching BOTH ways exactly once ─
		const union = await list({
			search: entityPrefix,
			plans: [{ id: inheritedProduct.id }, { id: entityProduct.id }],
		});
		const unionIds = union.list.map((entity) => entity.id).sort();
		expect(unionIds).toEqual(
			[alphaEntityId, betaEntityId, otherEntityId].sort(),
		);
		// The dedup assertion: no entity repeated despite alpha matching twice.
		expect(new Set(unionIds).size).toBe(unionIds.length);
		expect(union.total_filtered_count).toBe(unionIds.length);

		// ── Version filter ────────────────────────────────────────────────
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

		// ── plans + customer_id: never another customer's entities ────────
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

		// ── plans + search intersect rather than either winning ───────────
		const planAndSearch = await list({
			plans: [{ id: inheritedProduct.id }],
			search: betaEntityId,
		});
		expect(planAndSearch.list.map((entity) => entity.id)).toEqual([
			betaEntityId,
		]);
		expect(planAndSearch.total_filtered_count).toBe(1);

		// A search that excludes every plan match must win, not be ignored.
		const planAndImpossibleSearch = await list({
			plans: [{ id: entityProduct.id }],
			search: betaEntityId,
		});
		expect(planAndImpossibleSearch.list).toHaveLength(0);
		expect(planAndImpossibleSearch.total_filtered_count).toBe(0);
	},
);
