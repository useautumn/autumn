import type {
	AppEnv,
	BalanceFilter,
	CustomerListFilters,
	FeatureBalanceSortBasis,
	SortOrder,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { BalanceThresholdFilter } from "./balanceThresholdFilter.js";
import type { NominationCursor } from "./nominationCursor.js";

export type BalanceCandidateBackend = "motherduck" | "postgres";

export type NominationRow = {
	internal_customer_id: string;
	is_unlimited: boolean;
	total: number | string;
};

/** Candidate ids passing a threshold; `candidateIds` is null when the match
 * set is larger than the caller's cap. */
export type ThresholdMatch = {
	matchCount: number;
	candidateIds: string[] | null;
};

/** Nominates balance-sort/filter candidates from per-customer feature totals.
 * Postgres verifies and hydrates whatever a source nominates. */
export type BalanceCandidateSource = {
	backend: BalanceCandidateBackend;
	/** Exact totals rank correctly, so lake deflation exceptions don't apply. */
	ranksExactly: boolean;
	nominationBatchSize: number;
	maxPageSize: number;
	isAvailable: () => boolean;
	nominate: (params: {
		db: DrizzleCli;
		orgId: string;
		env: AppEnv;
		createdAtRange?: CustomerListFilters["created_at_range"];
		internalFeatureId: string;
		after: NominationCursor | null;
		sortOrder: SortOrder;
		basis: FeatureBalanceSortBasis;
		remainingFilter?: BalanceThresholdFilter;
	}) => Promise<NominationRow[]>;
	matchThreshold: (params: {
		db: DrizzleCli;
		orgId: string;
		env: AppEnv;
		internalFeatureId: string;
		balance: BalanceFilter;
		candidateCap: number;
	}) => Promise<ThresholdMatch | null>;
};
