import { describe, expect, test } from "bun:test";
import {
	type CatalogKey,
	type CatalogRow,
	catalogRowToCatalogKey,
} from "@autumn/balance-engine";
import type { CatalogRowIds } from "@autumn/postgres";
import {
	AllowanceType,
	AppEnv,
	BillingInterval,
	EntInterval,
	FeatureType,
	FreeTrialDuration,
} from "@autumn/shared";
import { createCatalogCache } from "../../src/createCatalogCache.js";
import type { CatalogRowsSource } from "../../src/types/catalogCacheContext.js";

const identity = {
	orgId: "org_1",
	env: "sandbox",
	customerId: "cus_1",
	entityId: null,
};

const entitlementRow = ({
	id,
	isCustom = false,
	productId = "prod_internal_1",
}: {
	id: string;
	isCustom?: boolean;
	productId?: string;
}): CatalogRow => ({
	table: "entitlements",
	row: {
		id,
		created_at: 1_700_000_000_000,
		internal_feature_id: "feat_internal_1",
		internal_product_id: productId,
		is_custom: isCustom,
		allowance_type: AllowanceType.Fixed,
		allowance: 1000,
		interval: EntInterval.Month,
		interval_count: 1,
		org_id: "org_1",
		usage_limit: null,
	},
});

const featureRow = ({
	internalId,
	env = AppEnv.Sandbox,
}: {
	internalId: string;
	env?: AppEnv;
}): CatalogRow => ({
	table: "features",
	row: {
		internal_id: internalId,
		org_id: "org_1",
		created_at: 1_700_000_000_000,
		env,
		id: "api_calls",
		name: "API calls",
		type: FeatureType.Metered,
		config: {},
		archived: false,
		event_names: [],
	},
});

const priceRow = ({
	id,
	isCustom = false,
}: {
	id: string;
	isCustom?: boolean;
}): CatalogRow => ({
	table: "prices",
	row: {
		id,
		internal_product_id: "prod_internal_1",
		org_id: "org_1",
		created_at: 1_700_000_000_000,
		is_custom: isCustom,
		config: {
			type: "fixed",
			amount: 10,
			interval: BillingInterval.Month,
			feature_id: null,
			internal_feature_id: null,
		},
		proration_config: null,
	},
});

const planLicenseRow = ({
	id,
	parentProductId,
	licenseProductId,
}: {
	id: string;
	parentProductId: string;
	licenseProductId: string;
}): CatalogRow => ({
	table: "planLicenses",
	row: {
		id,
		parent_internal_product_id: parentProductId,
		license_internal_product_id: licenseProductId,
		is_custom: false,
		org_id: "org_1",
		env: AppEnv.Sandbox,
		included: 5,
		prepaid_only: true,
		customized: false,
		metadata: {},
		created_at: 1,
		updated_at: 1,
		price_ids: [],
		entitlement_ids: [],
		internal_feature_ids: [],
	},
});

const freeTrialRow = ({
	id,
	productId = "prod_internal_1",
	env = AppEnv.Sandbox,
}: {
	id: string;
	productId?: string;
	env?: AppEnv;
}): CatalogRow => ({
	table: "freeTrials",
	row: {
		id,
		created_at: 1,
		internal_product_id: productId,
		duration: FreeTrialDuration.Day,
		length: 7,
		unique_fingerprint: false,
		is_custom: false,
		card_required: true,
		on_end: null,
		org_id: "org_1",
		env,
	},
});

const keyOf = (row: CatalogRow): CatalogKey => catalogRowToCatalogKey({ row });

type FakeDb = Pick<CatalogRowsSource, "getCatalogRows"> & {
	calls: CatalogRowIds[];
	release(): void;
};

/** Serves the rows whose ids were asked for, once released; records every request. */
const createFakeDb = ({ rows }: { rows: CatalogRow[] }): FakeDb => {
	const calls: CatalogRowIds[] = [];
	let release: () => void = () => {};
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	const rowsOf = <Table extends CatalogRow["table"]>(
		table: Table,
		ids: string[],
	) =>
		rows
			.filter((row) => row.table === table && ids.includes(keyOf(row).id))
			.map((row) => row.row);
	return {
		calls,
		release: () => release(),
		getCatalogRows: async ({ ids }) => {
			calls.push(ids);
			await gate;
			return {
				entitlements: rowsOf("entitlements", ids.entitlementIds),
				products: rowsOf("products", ids.productInternalIds),
				features: rowsOf("features", ids.featureInternalIds),
				prices: rowsOf("prices", ids.priceIds),
				plan_licenses: rowsOf("planLicenses", ids.planLicenseIds),
				free_trials: rowsOf("freeTrials", ids.freeTrialIds),
			} as Awaited<ReturnType<CatalogRowsSource["getCatalogRows"]>>;
		},
	};
};

const createCache = ({
	db,
	mutableRowTtlMs = 60_000,
	maxSizeBytes = 1_000_000,
}: {
	db: Pick<CatalogRowsSource, "getCatalogRows">;
	mutableRowTtlMs?: number;
	maxSizeBytes?: number;
}) =>
	createCatalogCache({
		ctx: { db, config: { mutableRowTtlMs, maxSizeBytes } },
	});

describe("catalog cache", () => {
	test("reads only what it holds; a load fills the gap from the source", async () => {
		const ent = entitlementRow({ id: "ent_1" });
		const db = createFakeDb({ rows: [ent] });
		db.release();
		const cache = createCache({ db });
		const keys = [keyOf(ent), { table: "products" as const, id: "prod_x" }];

		expect(cache.read({ keys })).toEqual({
			entitlements: {},
			products: {},
			features: {},
			prices: {},
			planLicenses: {},
			freeTrials: {},
		});
		await cache.load({ identity, keys });

		expect(Object.keys(cache.read({ keys }).entitlements)).toEqual(["ent_1"]);
		expect(cache.read({ keys }).products).toEqual({});
		expect(db.calls).toEqual([
			{
				entitlementIds: ["ent_1"],
				productInternalIds: ["prod_x"],
				featureInternalIds: [],
				priceIds: [],
				planLicenseIds: [],
				freeTrialIds: [],
			},
		]);
	});

	test("concurrent misses on the same keys share one source call", async () => {
		const ent = entitlementRow({ id: "ent_1" });
		const db = createFakeDb({ rows: [ent] });
		const cache = createCache({ db });

		const first = cache.load({ identity, keys: [keyOf(ent)] });
		const second = cache.load({ identity, keys: [keyOf(ent)] });
		db.release();
		await Promise.all([first, second]);

		expect(db.calls).toHaveLength(1);
		expect(cache.size()).toBe(1);
	});

	test("products and features expire; entitlements do not", async () => {
		const ent = entitlementRow({ id: "ent_1" });
		const feature = featureRow({ internalId: "feat_1" });
		const cache = createCache({
			db: createFakeDb({ rows: [] }),
			mutableRowTtlMs: 10,
		});
		cache.put({ rows: [ent, feature] });
		await Bun.sleep(25);

		const catalog = cache.read({ keys: [keyOf(ent), keyOf(feature)] });
		expect(Object.keys(catalog.entitlements)).toEqual(["ent_1"]);
		expect(catalog.features).toEqual({});
	});

	test("memory is bounded: the least recently used rows are evicted", () => {
		const rows = ["ent_1", "ent_2", "ent_3"].map((id) =>
			entitlementRow({ id }),
		);
		const rowBytes = JSON.stringify(rows[0]).length;
		const cache = createCache({
			db: createFakeDb({ rows: [] }),
			maxSizeBytes: rowBytes * 2,
		});
		cache.put({ rows });

		expect(cache.size()).toBe(2);
		expect(
			cache.read({ keys: rows.map(keyOf) }).entitlements,
		).not.toHaveProperty("ent_1");
	});

	test("invalidating an org expires its mutable rows and keeps custom entitlements and prices", async () => {
		const base = entitlementRow({ id: "ent_base" });
		const custom = entitlementRow({ id: "ent_custom", isCustom: true });
		const sandboxFeature = featureRow({ internalId: "feat_sandbox" });
		const liveFeature = featureRow({
			internalId: "feat_live",
			env: AppEnv.Live,
		});
		const basePrice = priceRow({ id: "price_base" });
		const customPrice = priceRow({ id: "price_custom", isCustom: true });
		const planLicense = planLicenseRow({
			id: "pl_seat",
			parentProductId: "prod_team",
			licenseProductId: "prod_seat",
		});
		const sandboxTrial = freeTrialRow({ id: "ft_sandbox" });
		const liveTrial = freeTrialRow({ id: "ft_live", env: AppEnv.Live });
		const rows = [
			base,
			custom,
			sandboxFeature,
			liveFeature,
			basePrice,
			customPrice,
			planLicense,
			sandboxTrial,
			liveTrial,
		];
		const cache = createCache({ db: createFakeDb({ rows: [] }) });
		cache.put({ rows });

		expect(cache.invalidate({ orgId: "org_1", env: "sandbox" })).toEqual({
			expiredCount: 5,
		});
		await Bun.sleep(5);
		const catalog = cache.read({ keys: rows.map(keyOf) });
		expect(Object.keys(catalog.entitlements)).toEqual(["ent_custom"]);
		expect(Object.keys(catalog.features)).toEqual(["feat_live"]);
		expect(Object.keys(catalog.prices)).toEqual(["price_custom"]);
		expect(catalog.planLicenses).toEqual({});
		expect(Object.keys(catalog.freeTrials)).toEqual(["ft_live"]);
		expect(
			cache.read({ keys: [base].map(keyOf), allowStale: true }).entitlements,
		).toHaveProperty("ent_base");
		expect(cache.invalidate({ orgId: "org_other", env: "sandbox" })).toEqual({
			expiredCount: 0,
		});
	});

	test("the invalidation index follows the LRU: evicted and overwritten rows leave it", async () => {
		const first = entitlementRow({ id: "ent_1" });
		const rowBytes = JSON.stringify(first).length;
		const cache = createCache({
			db: createFakeDb({ rows: [] }),
			maxSizeBytes: rowBytes * 2,
		});
		cache.put({
			rows: [
				first,
				entitlementRow({ id: "ent_2" }),
				entitlementRow({ id: "ent_3" }),
			],
		});
		// ent_1 was evicted: the org names two rows, not three.
		expect(cache.invalidate({ orgId: "org_1", env: "sandbox" })).toEqual({
			expiredCount: 2,
		});

		const moved = entitlementRow({ id: "ent_2" });
		moved.row.org_id = "org_2";
		cache.put({ rows: [moved] });
		expect(cache.invalidate({ orgId: "org_2", env: "sandbox" })).toEqual({
			expiredCount: 1,
		});
		expect(cache.invalidate({ orgId: "org_1", env: "sandbox" })).toEqual({
			expiredCount: 1,
		});
		await Bun.sleep(5);
		expect(
			cache.read({ keys: [first, moved].map(keyOf) }).entitlements,
		).toEqual({});
		expect(cache.size()).toBe(2);
	});

	test("a key the source cannot produce stays missing after a load", async () => {
		const db = createFakeDb({ rows: [] });
		db.release();
		const cache = createCache({ db });
		const keys: CatalogKey[] = [{ table: "entitlements", id: "ent_ghost" }];

		await cache.load({ identity, keys });

		expect(cache.read({ keys }).entitlements).toEqual({});
		expect(cache.size()).toBe(0);
	});

	test("refuses a non-positive configuration", () => {
		expect(() =>
			createCache({ db: createFakeDb({ rows: [] }), maxSizeBytes: 0 }),
		).toThrow(RangeError);
	});
});

test("an expired row is hidden from a strict read and still available to a stale one", async () => {
	// Entitlements are set with no expiry, so this only concerns the row types
	// that do age out. The decision runs after `ensure` has refreshed whatever
	// was due, so a row crossing its ttl in that gap is still the row just
	// fetched, and failing the request over that timing was costing traffic.
	// A strict read must still miss it, or `ensure` would never refresh it.
	const feature = featureRow({ internalId: "feat_stale" });
	const db = createFakeDb({ rows: [feature] });
	db.release();
	const cache = createCache({ db, mutableRowTtlMs: 20 });
	const keys = [keyOf(feature)];

	await cache.load({ identity, keys });
	expect(Object.keys(cache.read({ keys }).features)).toEqual(["feat_stale"]);

	await new Promise((resolve) => setTimeout(resolve, 40));

	expect(cache.read({ keys }).features).toEqual({});
	// Readable more than once: the first stale read must not drop the row.
	expect(Object.keys(cache.read({ keys, allowStale: true }).features)).toEqual([
		"feat_stale",
	]);
	expect(Object.keys(cache.read({ keys, allowStale: true }).features)).toEqual([
		"feat_stale",
	]);
});
