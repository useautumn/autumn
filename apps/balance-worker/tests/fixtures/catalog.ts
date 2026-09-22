import type { CatalogRow } from "@autumn/balance-engine";
import type {
	CatalogRowsEnvelope,
	SubjectRowsEnvelope,
} from "@autumn/postgres";
import {
	AllowanceType,
	AppEnv,
	EntInterval,
	FeatureType,
} from "@autumn/shared";
import { createCatalogCache } from "../../src/catalog/createCatalogCache.js";
import type { CatalogCache } from "../../src/catalog/types/catalogCache.js";
import type { WorkerDb } from "../../src/types/workerDb.js";

/** Fabricates catalog rows for whatever ids are asked, following the fixture id scheme (feat_<featureId>, ent_<id>). */
const syntheticCatalogRows = ({
	ids,
}: Parameters<WorkerDb["getCatalogRows"]>[0]): CatalogRowsEnvelope => ({
	entitlements: ids.entitlementIds.map((id) => ({
		id,
		created_at: 0,
		internal_feature_id: "feat_messages",
		internal_product_id: "prod_internal_pro",
		is_custom: false,
		allowance_type: AllowanceType.Fixed,
		allowance: 1000,
		interval: EntInterval.Month,
		interval_count: 1,
		org_id: "org_1",
		usage_limit: null,
	})),
	features: ids.featureInternalIds.map((internalId) => ({
		internal_id: internalId,
		org_id: "org_1",
		created_at: 0,
		env: AppEnv.Sandbox,
		id: internalId.replace(/^feat_/, ""),
		name: internalId,
		type: FeatureType.Metered,
		config: {},
		archived: false,
		event_names: [],
	})),
	prices: [],
	products: ids.productInternalIds.map((internalId) => ({
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
		internal_id: internalId,
		org_id: "org_1",
		created_at: 0,
		base_variant_id: null,
		archived: false,
		config: { ignore_past_due: false },
		metadata: {},
	})),
});

/** A Postgres stand-in: no customers, and every catalog id resolves to a synthetic row so tests never miss. */
export const createSyntheticWorkerDb = ({
	subjectRows = null,
}: {
	subjectRows?: SubjectRowsEnvelope | null;
} = {}): WorkerDb => ({
	getSubjectRows: async () => subjectRows,
	getCatalogRows: async (params) => syntheticCatalogRows(params),
	getBillingCycleAnchors: async () => ({}),
	promoteDuePooledContributions: async () => null,
});

/** A Postgres stand-in that knows nothing: every miss stays a miss. */
export const createEmptyWorkerDb = (): WorkerDb => ({
	getSubjectRows: async () => null,
	getBillingCycleAnchors: async () => ({}),
	promoteDuePooledContributions: async () => null,
	getCatalogRows: async () => ({
		entitlements: [],
		products: [],
		features: [],
		prices: [],
	}),
});

export const createTestCatalogCache = ({
	db = createSyntheticWorkerDb(),
	rows = [],
}: {
	db?: Pick<WorkerDb, "getCatalogRows">;
	rows?: CatalogRow[];
} = {}): CatalogCache => {
	const cache = createCatalogCache({
		ctx: { db, config: { mutableRowTtlMs: 60_000, maxSizeBytes: 1_000_000 } },
	});
	cache.put({ rows });
	return cache;
};
