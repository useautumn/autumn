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
		const runId = Date.now().toString(36);
		const targetCustomerId = "list-entities-customer-filter-target";
		const otherCustomerId = `list-entities-customer-filter-other-${runId}`;
		const targetEntityAlpha = `${targetCustomerId}-alpha`;
		const targetEntityBeta = `${targetCustomerId}-beta`;
		const otherEntityGamma = `${otherCustomerId}-gamma`;

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
		const runId = Date.now().toString(36);
		const targetCustomerId = "list-entities-customer-filter-cursor-target";
		const otherCustomerId = `list-entities-customer-filter-cursor-other-${runId}`;
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

		const byId = (a: ApiEntityV2, b: ApiEntityV2): number =>
			(a.id ?? "").localeCompare(b.id ?? "");
		// entities.list omits `invoices` (handleListEntitiesV2.ts); entities.get
		// returns `invoices: []`. Strip from both sides before deep-equal.
		const stripInvoices = ({ invoices: _, ...rest }: ApiEntityV2) => rest;
		const sortedList = [...listResponse.list].sort(byId).map(stripInvoices);
		const sortedGets = [...perEntityResponses].sort(byId).map(stripInvoices);

		expect(sortedList.map((entity) => entity.id)).toEqual(
			sortedGets.map((entity) => entity.id),
		);
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
