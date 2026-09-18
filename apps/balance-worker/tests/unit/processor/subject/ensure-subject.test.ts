import { describe, expect, test } from "bun:test";
import type { CatalogRow, SubjectState } from "@autumn/balance-engine";
import { createSubjectState } from "@autumn/balance-engine";
import type { CatalogRowIds } from "@autumn/postgres";
import {
	AllowanceType,
	AppEnv,
	CusProductStatus,
	EntInterval,
	FeatureType,
} from "@autumn/shared";
import { CatalogRowsNotFoundError } from "../../../../src/catalog/catalogErrors.js";
import { createCatalogCache } from "../../../../src/catalog/createCatalogCache.js";
import { ensureSubject } from "../../../../src/processor/subject/actions/ensureSubject/ensureSubject.js";
import { readSubject } from "../../../../src/processor/subject/actions/readSubject.js";
import {
	SubjectCatalogEvictedError,
	SubjectNotFoundError,
} from "../../../../src/processor/subject/subjectErrors.js";
import type { SubjectScope } from "../../../../src/processor/subject/types/subject.js";
import type { WorkerDb } from "../../../../src/types/workerDb.js";

const identity = {
	orgId: "org_1",
	env: "sandbox",
	customerId: "cus_1",
	entityId: null,
};

const state: SubjectState = createSubjectState({
	identity,
	customerProducts: [
		{
			id: "cp_1",
			internal_customer_id: "cus_internal_1",
			internal_product_id: "prod_internal_1",
			internal_entity_id: null,
			status: CusProductStatus.Active,
			options: [],
			quantity: 1,
			created_at: 1_700_000_000_000,
			starts_at: 1_700_000_000_000,
			access_starts_at: null,
			ended_at: null,
			customer_license_link_id: null,
		},
	],
	customerEntitlements: [
		{
			id: "ce_1",
			customer_product_id: "cp_1",
			entitlement_id: "ent_1",
			internal_customer_id: "cus_internal_1",
			internal_entity_id: null,
			internal_feature_id: "feat_internal_1",
			balance: 10,
			adjustment: 0,
			additional_balance: 0,
			unlimited: false,
			usage_allowed: false,
			next_reset_at: null,
			reset_cycle_anchor: null,
			expires_at: null,
			external_id: null,
			created_at: 1_700_000_000_000,
		},
	],
});

const rows: CatalogRow[] = [
	{
		table: "entitlements",
		row: {
			id: "ent_1",
			created_at: 1_700_000_000_000,
			internal_feature_id: "feat_internal_1",
			internal_product_id: "prod_internal_1",
			is_custom: false,
			allowance_type: AllowanceType.Fixed,
			allowance: 1000,
			interval: EntInterval.Month,
			interval_count: 1,
			org_id: "org_1",
			usage_limit: null,
		},
	},
	{
		table: "features",
		row: {
			internal_id: "feat_internal_1",
			org_id: "org_1",
			created_at: 1_700_000_000_000,
			env: AppEnv.Sandbox,
			id: "api_calls",
			name: "API calls",
			type: FeatureType.Metered,
			config: {},
			archived: false,
			event_names: [],
		},
	},
	{
		table: "products",
		row: {
			id: "pro",
			name: "Pro",
			description: null,
			is_add_on: false,
			is_default: false,
			version: 1,
			version_slug: "v1",
			active: true,
			deleted_at: null,
			previous_version_slug: null,
			group: "",
			env: AppEnv.Sandbox,
			internal_id: "prod_internal_1",
			org_id: "org_1",
			created_at: 1_700_000_000_000,
			base_variant_id: null,
			archived: false,
			config: { ignore_past_due: false },
			metadata: {},
		},
	},
];

const createScope = ({
	storedState,
	sourceRows,
}: {
	storedState: SubjectState | null;
	sourceRows: CatalogRow[];
}) => {
	const calls: CatalogRowIds[] = [];
	const db: WorkerDb = {
		getSubjectRows: async () => null,
		getCatalogRows: async ({ ids }) => {
			calls.push(ids);
			return {
				entitlements: sourceRows.flatMap((row) =>
					row.table === "entitlements" ? [row.row] : [],
				),
				products: sourceRows.flatMap((row) =>
					row.table === "products" ? [row.row] : [],
				),
				features: sourceRows.flatMap((row) =>
					row.table === "features" ? [row.row] : [],
				),
				prices: sourceRows.flatMap((row) =>
					row.table === "prices" ? [row.row] : [],
				),
			};
		},
	};
	const catalogCache = createCatalogCache({
		ctx: { db, config: { mutableRowTtlMs: 60_000, maxSizeBytes: 1_000_000 } },
	});
	const scope: SubjectScope = {
		ctx: {
			catalogCache,
			db,
			writer: {
				adopt: () => {
					throw new Error("not exercised");
				},
				decide: () => {
					throw new Error("not exercised");
				},
				readFreshestState: () => storedState,
			},
			receiptPolicy: { retentionMs: 1, now: () => 0 },
		},
		state: { hydrationPromises: new Map() },
	};
	return { scope, calls, catalogCache };
};

describe("ensure subject", () => {
	test("loads only the missing catalog rows, then every read is local", async () => {
		const { scope, calls, catalogCache } = createScope({
			storedState: state,
			sourceRows: rows,
		});
		catalogCache.put({ rows: rows.filter((row) => row.table === "features") });

		const subject = await ensureSubject({ scope, identity });

		expect(calls).toEqual([
			{
				entitlementIds: ["ent_1"],
				productInternalIds: ["prod_internal_1"],
				featureInternalIds: [],
				priceIds: [],
			},
		]);
		expect(Object.keys(subject.catalog.entitlements)).toEqual(["ent_1"]);
		expect(
			readSubject({ scope, state, identity }).customer_products,
		).toHaveLength(1);
		await ensureSubject({ scope, identity });
		expect(calls).toHaveLength(1);
	});

	test("names the rows no source can produce", async () => {
		const { scope } = createScope({ storedState: state, sourceRows: [] });

		await expect(ensureSubject({ scope, identity })).rejects.toBeInstanceOf(
			CatalogRowsNotFoundError,
		);
	});

	test("a customer with no state anywhere is a typed error", async () => {
		const { scope } = createScope({ storedState: null, sourceRows: rows });

		await expect(ensureSubject({ scope, identity })).rejects.toBeInstanceOf(
			SubjectNotFoundError,
		);
	});

	test("a synchronous read after eviction is an error, not a fetch", () => {
		const { scope, calls } = createScope({
			storedState: state,
			sourceRows: rows,
		});

		expect(() => readSubject({ scope, state, identity })).toThrow(
			SubjectCatalogEvictedError,
		);
		expect(calls).toEqual([]);
	});
});
