import type { CatalogRow } from "@autumn/balance-engine";
import { type CatalogCache, createCatalogCache } from "@autumn/catalog-lru";
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
import type { WorkerDb } from "../../src/types/workerDb.js";

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
	plan_licenses: [],
	free_trials: [],
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

export const entitySubjectRowsFrom =
	({
		getSubjectRows,
	}: Pick<WorkerDb, "getSubjectRows">): WorkerDb["getEntitySubjectRows"] =>
	async ({ identity, entityIds, asOfTimestampMs }) => {
		const envelopes: SubjectRowsEnvelope[] = [];
		for (const entityId of entityIds) {
			const envelope = await getSubjectRows({
				identity: { ...identity, entityId },
				asOfTimestampMs,
			});
			if (envelope) envelopes.push(envelope);
		}
		return envelopes;
	};

export const createSyntheticWorkerDb = ({
	subjectRows = null,
}: {
	subjectRows?: SubjectRowsEnvelope | null;
} = {}): WorkerDb => ({
	getSubjectRows: async () => subjectRows,
	readSubjectSnapshot: async () => null,
	readEntitySubjectSnapshots: async () => new Map(),
	getEntitySubjectRows: entitySubjectRowsFrom({
		getSubjectRows: async () => subjectRows,
	}),
	getCatalogRows: async (params) => syntheticCatalogRows(params),
	getBillingCycleAnchors: async () => ({}),
	claimCustomerByEmail: async () => null,
	listPooledBalancesWithoutOtherContributions: async () => [],
	sumPooledContributionGrants: async () => ({}),
});

export const createEmptyWorkerDb = (): WorkerDb => ({
	getSubjectRows: async () => null,
	readSubjectSnapshot: async () => null,
	readEntitySubjectSnapshots: async () => new Map(),
	getEntitySubjectRows: async () => [],
	getBillingCycleAnchors: async () => ({}),
	claimCustomerByEmail: async () => null,
	listPooledBalancesWithoutOtherContributions: async () => [],
	sumPooledContributionGrants: async () => ({}),
	getCatalogRows: async () => ({
		entitlements: [],
		products: [],
		features: [],
		prices: [],
		plan_licenses: [],
		free_trials: [],
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
