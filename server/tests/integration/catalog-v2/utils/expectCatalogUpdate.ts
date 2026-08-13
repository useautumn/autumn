import { expect } from "bun:test";
import type {
	ApiPlanV1,
	CatalogAction,
	CatalogFeatureUsage,
	PreviewUpdateCatalogResponse,
	UpdateCatalogResponse,
} from "@autumn/shared";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";

type ExpectedUsageBucket = {
	count?: number;
	countCapped?: boolean;
	/** Exact sample ids, in order. */
	sampleIds?: string[];
	/** Assert only the number of samples when order is data-driven. */
	sampleCount?: number;
};

type ExpectedFeatureUsage = {
	plans?: ExpectedUsageBucket;
	creditSystems?: ExpectedUsageBucket;
	customers?: ExpectedUsageBucket;
};

type ExpectedFeaturePreview = {
	featureId: string;
	action: CatalogAction;
	hasCustomerEntitlements?: boolean;
	willArchive?: boolean;
	/** null asserts "nothing changed"; an object is matched EXACTLY. */
	previousAttributes?: Record<string, unknown> | null;
	usage?: ExpectedFeatureUsage;
	/** Exact ordered list of state.reasons[].message (`[]` asserts no reasons). */
	reasonMessages?: string[];
	/** Each must be contained in the reason messages. */
	reasonsInclude?: string[];
};

const expectUsageBucketCorrect = ({
	bucket,
	expected,
}: {
	bucket: CatalogFeatureUsage["plans"];
	expected: ExpectedUsageBucket;
}) => {
	if (expected.count !== undefined) {
		expect(bucket.count).toBe(expected.count);
	}
	if (expected.countCapped !== undefined) {
		expect(bucket.count_capped).toBe(expected.countCapped);
	}
	if (expected.sampleIds !== undefined) {
		expect(bucket.samples.map((sample) => sample.id)).toEqual(
			expected.sampleIds,
		);
	}
	if (expected.sampleCount !== undefined) {
		expect(bucket.samples).toHaveLength(expected.sampleCount);
	}
};

/** Optional bucket fields are asserted only when passed. */
export const expectFeatureUsageCorrect = ({
	usage,
	plans,
	creditSystems,
	customers,
}: {
	usage: CatalogFeatureUsage;
	plans?: ExpectedUsageBucket;
	creditSystems?: ExpectedUsageBucket;
	customers?: ExpectedUsageBucket;
}) => {
	if (plans !== undefined) {
		expectUsageBucketCorrect({ bucket: usage.plans, expected: plans });
	}
	if (creditSystems !== undefined) {
		expectUsageBucketCorrect({
			bucket: usage.credit_systems,
			expected: creditSystems,
		});
	}
	if (customers !== undefined) {
		expectUsageBucketCorrect({
			bucket: usage.customers,
			expected: customers,
		});
	}
};

type ExpectedPlanPreview = {
	planId: string;
	action: CatalogAction;
	hasCustomers?: boolean;
	willArchive?: boolean;
};

/** Optional fields are asserted only when passed. */
export const expectCatalogPreviewCorrect = ({
	preview,
	features,
	plans,
}: {
	preview: PreviewUpdateCatalogResponse;
	features?: ExpectedFeaturePreview[];
	plans?: ExpectedPlanPreview[];
}) => {
	if (features !== undefined) {
		expect(preview.features).toHaveLength(features.length);
		for (const expected of features) {
			const entry = preview.features.find(
				(candidate) => candidate.feature_id === expected.featureId,
			);
			expect(entry).toBeDefined();
			expect(entry?.action).toBe(expected.action);
			if (expected.hasCustomerEntitlements !== undefined) {
				expect(entry?.state.has_customers).toBe(
					expected.hasCustomerEntitlements,
				);
			}
			if (expected.willArchive !== undefined) {
				expect(entry?.state.will_archive).toBe(expected.willArchive);
			}
			if (expected.previousAttributes === null) {
				expect(entry?.previous_attributes).toBeNull();
			} else if (expected.previousAttributes !== undefined) {
				expect(entry?.previous_attributes).toEqual(expected.previousAttributes);
			}
			if (expected.usage !== undefined && entry) {
				expectFeatureUsageCorrect({
					usage: entry.state.usage,
					...expected.usage,
				});
			}
			const reasonMessages =
				entry?.state.reasons.map((reason) => reason.message) ?? [];
			if (expected.reasonMessages !== undefined) {
				expect(reasonMessages).toEqual(expected.reasonMessages);
			}
			if (expected.reasonsInclude !== undefined) {
				for (const message of expected.reasonsInclude) {
					expect(reasonMessages).toContain(message);
				}
			}
		}
	}

	// Plans: containment only — extra entries and new fields must NOT break
	// existing tests. Assert exactly the fields passed, nothing else.
	if (plans !== undefined) {
		for (const expected of plans) {
			const entry = preview.plans.find(
				(candidate) => candidate.plan_id === expected.planId,
			);
			expect(entry, `missing preview entry for ${expected.planId}`).toBeDefined();
			expect(entry?.action).toBe(expected.action);
			if (expected.hasCustomers !== undefined) {
				expect(entry?.state.has_customers).toBe(expected.hasCustomers);
			}
			if (expected.willArchive !== undefined) {
				expect(entry?.state.will_archive).toBe(expected.willArchive);
			}
		}
	}
};

/**
 * Features: exact match, in order. Plans: containment — each expected
 * {id, action} must be reported, extra entries tolerated (future expansions).
 */
export const expectCatalogResultsCorrect = ({
	response,
	features,
	plans,
}: {
	response: UpdateCatalogResponse;
	features?: { id: string; action: CatalogAction }[];
	plans?: { id: string; action: CatalogAction }[];
}) => {
	if (features !== undefined) {
		expect(response.results.features).toEqual(features);
	}
	if (plans !== undefined) {
		for (const expected of plans) {
			const entry = response.results.plans.find(
				(candidate) => candidate.id === expected.id,
			);
			expect(entry, `missing result for plan ${expected.id}`).toBeDefined();
			expect(entry?.action).toBe(expected.action);
		}
	}
};

/** The plan's items reference exactly these feature ids, in item order. */
export const expectPlanFeatureIdsCorrect = async ({
	autumn,
	planId,
	featureIds,
}: {
	autumn: AutumnInt;
	planId: string;
	featureIds: string[];
}) => {
	const plan = await autumn.products.get<ApiPlanV1>(planId);
	expect(plan.items.map((item) => item.feature_id)).toEqual(featureIds);
};
