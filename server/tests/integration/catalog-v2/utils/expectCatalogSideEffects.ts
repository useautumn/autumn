import { expect } from "bun:test";
import {
	type AllowanceType,
	type EntInterval,
	entitlements,
	type Feature,
	prices,
} from "@autumn/shared";
import { eq, sql } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { FeatureService } from "@/internal/features/FeatureService.js";

const getDbFeature = async ({
	ctx,
	featureId,
}: {
	ctx: AutumnContext;
	featureId: string;
}): Promise<Feature> => {
	const dbFeatures = await FeatureService.list({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	const feature = dbFeatures.find((candidate) => candidate.id === featureId);
	expect(feature).toBeDefined();
	if (!feature) throw new Error(`feature ${featureId} not found`);
	return feature;
};

/** Nullable fields: pass null to assert null, omit to skip. Applies to EVERY row. */
export const expectDbEntitlementsCorrect = async ({
	ctx,
	featureId,
	expected,
}: {
	ctx: AutumnContext;
	featureId: string;
	expected: {
		count?: number;
		allowanceType?: AllowanceType | null;
		interval?: EntInterval | null;
		entityFeatureId?: string | null;
	};
}) => {
	const feature = await getDbFeature({ ctx, featureId });
	const rows = await ctx.db
		.select()
		.from(entitlements)
		.where(eq(entitlements.internal_feature_id, feature.internal_id ?? ""));

	if (expected.count !== undefined) expect(rows).toHaveLength(expected.count);
	expect(rows.length).toBeGreaterThan(0);
	for (const row of rows) {
		if (expected.allowanceType !== undefined) {
			expect(row.allowance_type).toBe(expected.allowanceType);
		}
		if (expected.interval !== undefined) {
			expect(row.interval).toBe(expected.interval);
		}
		if (expected.entityFeatureId !== undefined) {
			expect(row.entity_feature_id).toBe(expected.entityFeatureId);
		}
	}
};

/** Nullable fields: pass null to assert null, omit to skip. Applies to EVERY row. */
export const expectDbPricesCorrect = async ({
	ctx,
	featureId,
	expected,
}: {
	ctx: AutumnContext;
	featureId: string;
	expected: {
		count?: number;
		configFeatureId?: string;
		shouldProrate?: boolean;
		stripePriceId?: string | null;
	};
}) => {
	const feature = await getDbFeature({ ctx, featureId });
	const rows = await ctx.db
		.select()
		.from(prices)
		.where(
			sql`${prices.config} ->> 'internal_feature_id' = ${feature.internal_id ?? ""}`,
		);

	if (expected.count !== undefined) expect(rows).toHaveLength(expected.count);
	expect(rows.length).toBeGreaterThan(0);
	for (const row of rows) {
		const config = row.config as Record<string, unknown> | null;
		if (expected.configFeatureId !== undefined) {
			expect(config?.feature_id).toBe(expected.configFeatureId);
		}
		if (expected.shouldProrate !== undefined) {
			expect(config?.should_prorate).toBe(expected.shouldProrate);
		}
		if (expected.stripePriceId !== undefined) {
			expect(config?.stripe_price_id ?? null).toBe(expected.stripePriceId);
		}
	}
};

/** The credit system's schema references exactly these metered feature ids. */
export const expectDbCreditSchemaCorrect = async ({
	ctx,
	creditSystemId,
	meteredFeatureIds,
}: {
	ctx: AutumnContext;
	creditSystemId: string;
	meteredFeatureIds: string[];
}) => {
	const creditSystem = await getDbFeature({ ctx, featureId: creditSystemId });
	const schema = creditSystem.config?.schema ?? [];
	expect(
		schema
			.map((entry: { metered_feature_id: string }) => entry.metered_feature_id)
			.sort(),
	).toEqual([...meteredFeatureIds].sort());
};

/** Feature row exists and is archived. */
export const expectDbFeatureArchived = async ({
	ctx,
	featureId,
}: {
	ctx: AutumnContext;
	featureId: string;
}) => {
	const feature = await getDbFeature({ ctx, featureId });
	expect(feature.archived).toBe(true);
};

export const archiveDbFeature = async ({
	ctx,
	featureId,
}: {
	ctx: AutumnContext;
	featureId: string;
}) => {
	await FeatureService.update({
		db: ctx.db,
		id: featureId,
		orgId: ctx.org.id,
		env: ctx.env,
		updates: { archived: true },
	});
};
