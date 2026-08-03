/**
 * Contract coverage for the `plans` filter on the CURSOR entities.list path
 * (API 2.3.0, start_cursor pagination).
 *
 * Sibling of list-entities-plan-filter.test.ts, which covers the same filter on
 * the 2.2.0 offset path. The two paths are separate query builders, so neither
 * test covers the other.
 *
 * Contract (behaviour-preserving — this exists to pin behaviour while
 * getCursorPaginatedEntitySubjectsQuery moves from a per-entity EXISTS to the
 * plan_scopes join):
 *   Endpoint:
 *     - POST /v1/entities.list @ 2.3.0 -> { list, next_cursor }
 *   Behaviors:
 *     - plans:[X] -> entities whose customer holds X (inherited) or that hold X
 *     - a plan nobody holds -> empty list, next_cursor null
 *     - union across plans, an entity matching BOTH ways appearing exactly once
 *     - versions:[matching] included; versions:[absent] excluded
 *     - plans + customer_id -> intersection, never another customer's entities
 *     - plans + search -> intersection
 *     - paging with start_cursor under a plan filter -> every entity exactly
 *       once across pages, and the same set as a single large page
 *   Side effects:
 *     - none; read-only.
 *
 * The paging assertion is the one the offset sibling cannot make: the cursor
 * predicate and the plan join have to compose, and a mistake there shows up as
 * a duplicated or skipped entity at a page boundary rather than a wrong count.
 */

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

		// Three entities so a limit of 1 produces real page boundaries.
		for (const entityId of [alphaEntityId, betaEntityId, gammaEntityId]) {
			await autumnV2_1.entitiesV2.create({
				customer_id: customerId,
				entity_id: entityId,
				feature_id: TestFeature.Users,
				name: entityId,
			});
		}

		// alpha matches inheritedProduct (via its customer) AND entityProduct
		// (directly) — the dedup case.
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: entityProduct.id,
			entity_id: alphaEntityId,
		});

		// Second customer on the SAME inherited plan, so scope isolation is
		// exercised rather than assumed. Not owned by initScenario, so clear it
		// or a re-run collides on the deterministic id.
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

		// entities.list sits under the ListCustomers rate limiter and this test
		// makes ~10 calls — space them or the run dies mid-suite.
		const list = async (body: Record<string, unknown>) => {
			await timeout(1200);
			return autumnV2_3.entitiesV2.list<CursorPaginatedResponse<ApiEntityV2>>({
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
		expect(unattached.next_cursor).toBeNull();

		// ── Union across plans, alpha matching both ways exactly once ─────
		const union = await list({
			search: entityPrefix,
			plans: [{ id: inheritedProduct.id }, { id: entityProduct.id }],
		});
		const unionIds = union.list.map((entity) => entity.id).sort();
		expect(unionIds).toEqual(
			[alphaEntityId, betaEntityId, gammaEntityId, otherEntityId].sort(),
		);
		expect(new Set(unionIds).size).toBe(unionIds.length);

		// ── Version filter ────────────────────────────────────────────────
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

		// ── plans + customer_id: never another customer's entities ────────
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

		// ── plans + search intersect ──────────────────────────────────────
		const planAndSearch = await list({
			plans: [{ id: inheritedProduct.id }],
			search: betaEntityId,
		});
		expect(planAndSearch.list.map((entity) => entity.id)).toEqual([
			betaEntityId,
		]);

		// ── Paging under a plan filter: every entity exactly once ─────────
		// The cursor predicate and the plan join must compose; a mistake shows up
		// as a duplicate or a skip at a page boundary.
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
