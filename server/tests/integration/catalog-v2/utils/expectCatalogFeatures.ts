import { expect } from "bun:test";
import type { FeatureType, FeatureUsageType } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { clearOrgCache } from "@/internal/orgs/orgUtils/clearOrgCache.js";

type ExpectedDbFeature = {
	id: string;
	type: FeatureType;
	usageType?: FeatureUsageType;
	creditSchema?: { metered_feature_id: string; credit_amount: number }[];
	defaultMarkup?: number;
};

const listDbFeatures = ({ ctx }: { ctx: AutumnContext }) =>
	FeatureService.list({ db: ctx.db, orgId: ctx.org.id, env: ctx.env });

/** Optional fields are asserted only when passed. */
export const expectDbFeaturesCorrect = async ({
	ctx,
	expected,
}: {
	ctx: AutumnContext;
	expected: ExpectedDbFeature[];
}) => {
	const dbFeatures = await listDbFeatures({ ctx });

	for (const expectedFeature of expected) {
		const feature = dbFeatures.find(
			(candidate) => candidate.id === expectedFeature.id,
		);
		expect(feature).toBeDefined();
		expect(feature?.type).toBe(expectedFeature.type);
		if (expectedFeature.usageType !== undefined) {
			expect(feature?.config?.usage_type).toBe(expectedFeature.usageType);
		}
		if (expectedFeature.creditSchema !== undefined) {
			expect(feature?.config?.schema).toEqual(expectedFeature.creditSchema);
		}
		if (expectedFeature.defaultMarkup !== undefined) {
			expect(feature?.config?.default_markup).toBe(
				expectedFeature.defaultMarkup,
			);
		}
	}
};

export const expectDbFeaturesAbsent = async ({
	ctx,
	featureIds,
}: {
	ctx: AutumnContext;
	featureIds: string[];
}) => {
	const dbFeatures = await listDbFeatures({ ctx });
	for (const featureId of featureIds) {
		expect(dbFeatures.some((candidate) => candidate.id === featureId)).toBe(
			false,
		);
	}
};

/** Idempotent — skips ids that don't exist, so it doubles as leftover-state cleanup. */
export const deleteDbFeatures = async ({
	ctx,
	featureIds,
}: {
	ctx: AutumnContext;
	featureIds: string[];
}) => {
	const dbFeatures = await listDbFeatures({ ctx });
	let deleted = false;
	for (const featureId of featureIds) {
		if (!dbFeatures.some((candidate) => candidate.id === featureId)) continue;
		await FeatureService.delete({
			db: ctx.db,
			orgId: ctx.org.id,
			featureId,
			env: ctx.env,
		});
		deleted = true;
	}
	// Direct DB writes bypass the org features cache — clear it so the next
	// request's ctx.features doesn't resurrect the deleted rows.
	if (deleted) {
		await clearOrgCache({ db: ctx.db, orgId: ctx.org.id, env: ctx.env });
	}
};
