/**
 * TDD test for the entities.list `customer_id` filter.
 *
 * Contract under test:
 *   - POST /v1/entities.list accepts an optional `customer_id` param.
 *   - When set, the response list contains ONLY entities owned by that customer.
 *   - When set, total_filtered_count reflects the customer-scoped count.
 *   - When unset, behavior matches today (org-wide scan).
 *
 * Motivation:
 *   Replaces fan-out `entities.get` polling (1 request per entity for a given
 *   customer) with a paginated bulk fetch (~limit-many calls). Drives the same
 *   per-entity hydration pipeline as today's list path, just filtered.
 *
 * Pre-impl red: the schema rejects `customer_id` and entities from other
 * customers leak through.
 * Post-impl green: the filter is honored at the query level and the response
 * only contains entities for the requested customer.
 */

import { expect, test } from "bun:test";
import {
	type ApiEntityV2,
	ApiVersion,
	type CursorPaginatedResponse,
	type PagePaginatedResponse,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

type ListEntitiesResponse<T> = PagePaginatedResponse<T> & {
	total_count: number;
	total_filtered_count: number;
};

test.concurrent(
	`${chalk.yellowBright("list entities: customer_id filter scopes results to one customer")}`,
	async () => {
		const targetCustomerId = "list-entities-customer-filter-target";
		const otherCustomerId = "list-entities-customer-filter-other";
		const targetEntityAlpha = `${targetCustomerId}-alpha`;
		const targetEntityBeta = `${targetCustomerId}-beta`;
		const otherEntityGamma = `${otherCustomerId}-gamma`;

		// Set up the target customer + two entities.
		const { autumnV2_1 } = await initScenario({
			customerId: targetCustomerId,
			setup: [s.customer({})],
			actions: [],
		});

		await autumnV2_1.entitiesV2.create({
			customer_id: targetCustomerId,
			entity_id: targetEntityAlpha,
			feature_id: TestFeature.Users,
			name: "Target Alpha",
		});
		await autumnV2_1.entitiesV2.create({
			customer_id: targetCustomerId,
			entity_id: targetEntityBeta,
			feature_id: TestFeature.Users,
			name: "Target Beta",
		});

		// Set up a second customer with an entity that should NOT appear in the
		// filtered result. Uses the same org (initScenario shares org), so the
		// org-wide listing would otherwise return all three entities.
		await autumnV2_1.customers.create({
			id: otherCustomerId,
			name: "Other Customer",
		});
		await autumnV2_1.entitiesV2.create({
			customer_id: otherCustomerId,
			entity_id: otherEntityGamma,
			feature_id: TestFeature.Users,
			name: "Other Gamma",
		});

		// Contract: with customer_id set, only entities for that customer come back.
		const filtered = await autumnV2_1.entitiesV2.list<
			ListEntitiesResponse<ApiEntityV2>
		>({
			customer_id: targetCustomerId,
			limit: 10,
			offset: 0,
			keepInternalFields: true,
		});

		const filteredIds = filtered.list.map((entity) => entity.id).sort();
		expect(filteredIds).toEqual([targetEntityAlpha, targetEntityBeta].sort());
		expect(filtered.total_filtered_count).toBe(2);
		for (const entity of filtered.list) {
			expect(entity.customer_id).toBe(targetCustomerId);
		}

		// Contract: without customer_id, the unrelated entity is also visible
		// (sanity check that the filter is what excluded it, not the test setup).
		const unfiltered = await autumnV2_1.entitiesV2.list<
			ListEntitiesResponse<ApiEntityV2>
		>({
			limit: 100,
			offset: 0,
			keepInternalFields: true,
		});

		const unfilteredIds = unfiltered.list.map((entity) => entity.id);
		expect(unfilteredIds).toContain(targetEntityAlpha);
		expect(unfilteredIds).toContain(targetEntityBeta);
		expect(unfilteredIds).toContain(otherEntityGamma);
	},
);

test.concurrent(
	`${chalk.yellowBright("list entities: customer_id filter works on the latest cursor-paginated response")}`,
	async () => {
		const targetCustomerId = "list-entities-customer-filter-cursor-target";
		const otherCustomerId = "list-entities-customer-filter-cursor-other";
		const targetEntityId = `${targetCustomerId}-only`;
		const otherEntityId = `${otherCustomerId}-only`;

		const { autumnV2_1, ctx } = await initScenario({
			customerId: targetCustomerId,
			setup: [s.customer({})],
			actions: [],
		});

		await autumnV2_1.entitiesV2.create({
			customer_id: targetCustomerId,
			entity_id: targetEntityId,
			feature_id: TestFeature.Users,
			name: "Target Cursor Only",
		});

		await autumnV2_1.customers.create({
			id: otherCustomerId,
			name: "Other Cursor Customer",
		});
		await autumnV2_1.entitiesV2.create({
			customer_id: otherCustomerId,
			entity_id: otherEntityId,
			feature_id: TestFeature.Users,
			name: "Other Cursor Only",
		});

		// Latest version routes through the cursor pagination handler.
		const latestClient = new AutumnInt({
			version: ApiVersion.V2_3,
			secretKey: ctx.orgSecretKey,
		});

		const cursorResponse = await latestClient.entitiesV2.list<
			CursorPaginatedResponse<ApiEntityV2>
		>({
			customer_id: targetCustomerId,
			limit: 25,
			keepInternalFields: true,
		});

		const cursorIds = cursorResponse.list.map((entity) => entity.id);
		expect(cursorIds).toEqual([targetEntityId]);
		for (const entity of cursorResponse.list) {
			expect(entity.customer_id).toBe(targetCustomerId);
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("list entities: bulk filtered response matches the union of per-entity entities.get calls")}`,
	async () => {
		const customerId = "list-entities-customer-filter-parity";
		const entityIds = [
			`${customerId}-entity-1`,
			`${customerId}-entity-2`,
			`${customerId}-entity-3`,
		];

		const { autumnV2_1 } = await initScenario({
			customerId,
			setup: [s.customer({})],
			actions: [],
		});

		for (const [index, entityId] of entityIds.entries()) {
			await autumnV2_1.entitiesV2.create({
				customer_id: customerId,
				entity_id: entityId,
				feature_id: TestFeature.Users,
				name: `Parity Entity ${index + 1}`,
			});
		}

		const listResponse = await autumnV2_1.entitiesV2.list<
			ListEntitiesResponse<ApiEntityV2>
		>({
			customer_id: customerId,
			limit: 25,
			offset: 0,
			keepInternalFields: true,
		});

		const perEntityResponses = await Promise.all(
			entityIds.map((entityId) =>
				autumnV2_1.entities.get<ApiEntityV2>(customerId, entityId),
			),
		);

		// Sort both sides by entity id so the comparison is order-independent.
		const byId = (a: ApiEntityV2, b: ApiEntityV2): number =>
			(a.id ?? "").localeCompare(b.id ?? "");
		const sortedList = [...listResponse.list].sort(byId);
		const sortedGets = [...perEntityResponses].sort(byId);

		expect(sortedList.map((entity) => entity.id)).toEqual(
			sortedGets.map((entity) => entity.id),
		);

		// Full per-entity shape must match — the list builder and the get
		// handler hydrate from the same FullSubject pipeline, so any drift
		// here is a regression we want to catch.
		expect(sortedList).toEqual(sortedGets);
	},
);

test.concurrent(
	`${chalk.yellowBright("list entities: customer_id filter returns an empty list for an unknown customer")}`,
	async () => {
		const customerId = "list-entities-customer-filter-empty-target";
		const entityId = `${customerId}-entity`;

		const { autumnV2_1 } = await initScenario({
			customerId,
			setup: [s.customer({})],
			actions: [],
		});

		await autumnV2_1.entitiesV2.create({
			customer_id: customerId,
			entity_id: entityId,
			feature_id: TestFeature.Users,
			name: "Existing Entity",
		});

		// Contract: unknown customer id returns zero entities, NOT the org-wide
		// list. This is the access-scoping guarantee callers rely on.
		const unknownResponse = await autumnV2_1.entitiesV2.list<
			ListEntitiesResponse<ApiEntityV2>
		>({
			customer_id: "list-entities-customer-filter-does-not-exist",
			limit: 25,
			offset: 0,
			keepInternalFields: true,
		});

		expect(unknownResponse.list).toEqual([]);
		expect(unknownResponse.total_filtered_count).toBe(0);
	},
);
