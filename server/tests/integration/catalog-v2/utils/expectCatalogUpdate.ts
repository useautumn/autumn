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

/** Optional fields are asserted only when passed. */
export const expectCatalogPreviewCorrect = ({
	preview,
	features,
}: {
	preview: PreviewUpdateCatalogResponse;
	features: ExpectedFeaturePreview[];
}) => {
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
};

/** Exact match on what the update reports it did, in order. */
export const expectCatalogResultsCorrect = ({
	response,
	features,
}: {
	response: UpdateCatalogResponse;
	features: { id: string; action: CatalogAction }[];
}) => {
	expect(response.results.features).toEqual(features);
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
