import { EntInterval, type FullProduct } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { sql } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getFullLicenseProduct } from "@/internal/licenses/licenseUtils.js";
import { licenseItemRepo } from "@/internal/licenses/repos/licenseItemRepo.js";
import { BENCH_PAID_PRODUCT_ID } from "./benchContext.js";

export const BENCH_LICENSE_ENTITLEMENT_ID = "ent_bench_license_words";
export const BENCH_LICENSE_ALLOWANCE = 100;
export const BENCH_LICENSE_FEATURE_ID = TestFeature.Words;

/**
 * Gives the bench license plan a metered entitlement and links it to every
 * catalog link that offers the plan. The bench org is seeded with raw inserts
 * rather than the API, so a hand-inserted plan_license starts with no junction
 * rows — leaving the supersede path nothing to repoint.
 */
export const ensureBenchLicenseEntitlement = async ({
	ctx,
}: {
	ctx: AutumnContext;
}): Promise<FullProduct> => {
	const licenseProduct = await getFullLicenseProduct({
		ctx,
		idOrInternalId: BENCH_PAID_PRODUCT_ID,
	});

	const [feature]: Array<{ internal_id: string }> = await ctx.db.execute(sql`
		SELECT internal_id FROM features
		WHERE org_id = ${ctx.org.id} AND env = ${ctx.env} AND id = ${TestFeature.Words}
		LIMIT 1
	`);
	if (!feature) {
		throw new Error(
			`bench org is missing the ${TestFeature.Words} feature — seed it first`,
		);
	}

	await ctx.db.execute(sql`
		INSERT INTO entitlements (
			id, org_id, internal_product_id, internal_feature_id, feature_id,
			allowance, allowance_type, interval, interval_count, is_custom,
			pooled, carry_from_previous, created_at
		)
		VALUES (
			${BENCH_LICENSE_ENTITLEMENT_ID}, ${ctx.org.id},
			${licenseProduct.internal_id}, ${feature.internal_id},
			${TestFeature.Words}, ${BENCH_LICENSE_ALLOWANCE}, 'fixed',
			${EntInterval.Month}, 1, false, false, false, ${Date.now()}
		)
		ON CONFLICT (id) DO UPDATE SET allowance = ${BENCH_LICENSE_ALLOWANCE}
	`);

	const links: Array<{ id: string }> = await ctx.db.execute(sql`
		SELECT id FROM plan_license
		WHERE license_internal_product_id = ${licenseProduct.internal_id}
			AND is_custom = false
	`);
	for (const link of links) {
		await licenseItemRepo.replaceItems({
			db: ctx.db,
			planLicenseId: link.id,
			items: [{ entitlementId: BENCH_LICENSE_ENTITLEMENT_ID }],
			customized: false,
		});
	}

	return await getFullLicenseProduct({
		ctx,
		idOrInternalId: BENCH_PAID_PRODUCT_ID,
	});
};
