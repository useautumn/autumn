import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { AppEnv, type FullProduct, type Organization } from "@autumn/shared";
import {
	ctxForOrgEnv,
	insertCopyTestOrg,
	seedCopyTestBooleanFeature,
	seedCopyTestPlan,
} from "@tests/utils/fixtures/copyEnvFixtures.js";
import { initDrizzle } from "@/db/initDrizzle.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { planLicenseRepo } from "@/internal/licenses/repos/planLicenseRepo.js";
import { deletePlatformSubOrg } from "@/internal/orgs/deleteOrg/deletePlatformSubOrg.js";
import { copyProductForOrgs } from "@/internal/products/handlers/handleCopyProduct/copyProductForOrgs.js";
import { ProductService } from "@/internal/products/ProductService.js";

// Copying a single base plan (the "Copy Plan to Production" dialog) must carry
// the base's variants and license links along, remapped to the target env.

const { db } = initDrizzle();
const suffix = crypto.randomUUID().slice(0, 8);

const BASE_FEATURE = `cpv_base_feat_${suffix}`;
const VARIANT_FEATURE = `cpv_variant_feat_${suffix}`;

const RENAME_BASE_PLAN = `cpv_rename_base_${suffix}`;
const RENAME_TARGET_PLAN = `cpv_rename_target_${suffix}`;
const RENAME_VARIANT_PLAN = `cpv_rename_variant_${suffix}`;
const CONFLICT_BASE_PLAN = `cpv_conflict_base_${suffix}`;
const CONFLICT_TAKEN_PLAN = `cpv_conflict_taken_${suffix}`;
const CONFLICT_FREE_PLAN = `cpv_conflict_free_${suffix}`;
const LICENSE_BASE_PLAN = `cpv_license_base_${suffix}`;
const REUSED_LICENSE_PLAN = `cpv_reused_license_${suffix}`;
const PULLED_LICENSE_FEATURE = `cpv_pulled_license_feat_${suffix}`;
const PULLED_LICENSE_PLAN = `cpv_pulled_license_${suffix}`;

let org: Organization | undefined;

const ctxForEnv = (env: AppEnv): AutumnContext => {
	if (!org) throw new Error("org not provisioned");
	return ctxForOrgEnv({ org, env });
};

const seedFeature = ({ featureId }: { featureId: string }) =>
	seedCopyTestBooleanFeature({ ctx: ctxForEnv(AppEnv.Sandbox), featureId });

const seedPlan = ({
	env,
	planId,
	featureIds,
	baseInternalProductId,
}: {
	env: AppEnv;
	planId: string;
	featureIds?: string[];
	baseInternalProductId?: string;
}): Promise<FullProduct> =>
	seedCopyTestPlan({
		db,
		ctx: ctxForEnv(env),
		planId,
		featureIds,
		baseInternalProductId,
	});

const listLivePlans = async (): Promise<FullProduct[]> =>
	ProductService.listFull({
		db,
		orgId: org?.id as string,
		env: AppEnv.Live,
		returnAll: true,
	});

const copyPlanToLive = async ({
	fromProductId,
	toId,
	toName,
}: {
	fromProductId: string;
	toId: string;
	toName: string;
}) => {
	if (!org) throw new Error("org not provisioned");
	await copyProductForOrgs({
		ctx: ctxForEnv(AppEnv.Sandbox),
		fromOrg: org,
		fromEnv: AppEnv.Sandbox,
		toOrg: org,
		toEnv: AppEnv.Live,
		fromProductId,
		toId,
		toName,
	});
};

beforeAll(async () => {
	org = await insertCopyTestOrg({ db, name: `cpv-org-${suffix}` });
	await seedFeature({ featureId: BASE_FEATURE });
	await seedFeature({ featureId: VARIANT_FEATURE });
}, 180_000);

afterAll(async () => {
	if (org) {
		await deletePlatformSubOrg({
			db,
			org,
			logger,
			skipLiveCustomerCheck: true,
		}).catch(() => {});
	}
}, 180_000);

describe("copying a single base plan carries its variants", () => {
	test("copies variants under a renamed base with their features intact", async () => {
		const base = await seedPlan({
			env: AppEnv.Sandbox,
			planId: RENAME_BASE_PLAN,
			featureIds: [BASE_FEATURE],
		});
		const variant = await seedPlan({
			env: AppEnv.Sandbox,
			planId: RENAME_VARIANT_PLAN,
			featureIds: [VARIANT_FEATURE],
			baseInternalProductId: base.internal_id,
		});

		await copyPlanToLive({
			fromProductId: RENAME_BASE_PLAN,
			toId: RENAME_TARGET_PLAN,
			toName: "Renamed Base",
		});

		const livePlans = await listLivePlans();
		const liveBase = livePlans.find((p) => p.id === RENAME_TARGET_PLAN);
		const liveVariant = livePlans.find((p) => p.id === RENAME_VARIANT_PLAN);

		expect(liveBase?.name).toBe("Renamed Base");
		expect(liveVariant?.name).toBe(variant.name);
		expect(liveVariant?.base_internal_product_id).toBe(
			liveBase?.internal_id as string,
		);
		expect(livePlans.some((p) => p.id === RENAME_BASE_PLAN)).toBe(false);

		// The variant's own entitlement feature must come along too.
		const liveFeatures = await FeatureService.list({
			db,
			orgId: org?.id as string,
			env: AppEnv.Live,
		});
		expect(liveFeatures.map((f) => f.id)).toContain(VARIANT_FEATURE);
	});

	test("skips a variant whose id is already taken in the target", async () => {
		const taken = await seedPlan({
			env: AppEnv.Live,
			planId: CONFLICT_TAKEN_PLAN,
		});
		const base = await seedPlan({
			env: AppEnv.Sandbox,
			planId: CONFLICT_BASE_PLAN,
		});
		await seedPlan({
			env: AppEnv.Sandbox,
			planId: CONFLICT_TAKEN_PLAN,
			baseInternalProductId: base.internal_id,
		});
		await seedPlan({
			env: AppEnv.Sandbox,
			planId: CONFLICT_FREE_PLAN,
			baseInternalProductId: base.internal_id,
		});

		await copyPlanToLive({
			fromProductId: CONFLICT_BASE_PLAN,
			toId: CONFLICT_BASE_PLAN,
			toName: "Conflict Base",
		});

		const livePlans = await listLivePlans();
		const liveBase = livePlans.find((p) => p.id === CONFLICT_BASE_PLAN);
		const liveFreeVariant = livePlans.find((p) => p.id === CONFLICT_FREE_PLAN);
		const liveTaken = livePlans.filter((p) => p.id === CONFLICT_TAKEN_PLAN);

		expect(liveFreeVariant?.base_internal_product_id).toBe(
			liveBase?.internal_id as string,
		);
		// The pre-existing target plan is neither duplicated nor relinked.
		expect(liveTaken.length).toBe(1);
		expect(liveTaken[0]?.internal_id).toBe(taken.internal_id);
		expect(liveTaken[0]?.base_internal_product_id).toBeNull();
	});

	test("recreates license links, reusing target plans and pulling absent ones", async () => {
		await seedFeature({ featureId: PULLED_LICENSE_FEATURE });
		const reusedSourceLicense = await seedPlan({
			env: AppEnv.Sandbox,
			planId: REUSED_LICENSE_PLAN,
		});
		const reusedTargetLicense = await seedPlan({
			env: AppEnv.Live,
			planId: REUSED_LICENSE_PLAN,
		});
		const pulledLicense = await seedPlan({
			env: AppEnv.Sandbox,
			planId: PULLED_LICENSE_PLAN,
			featureIds: [PULLED_LICENSE_FEATURE],
		});
		const base = await seedPlan({
			env: AppEnv.Sandbox,
			planId: LICENSE_BASE_PLAN,
		});
		for (const license of [reusedSourceLicense, pulledLicense]) {
			await planLicenseRepo.upsert({
				db,
				parentInternalProductId: base.internal_id,
				licenseInternalProductId: license.internal_id,
				included: 1,
				prepaidOnly: true,
				metadata: {},
			});
		}

		await copyPlanToLive({
			fromProductId: LICENSE_BASE_PLAN,
			toId: LICENSE_BASE_PLAN,
			toName: "License Base",
		});

		const livePlans = await listLivePlans();
		const liveBase = livePlans.find((p) => p.id === LICENSE_BASE_PLAN);
		const livePulledLicense = livePlans.find(
			(p) => p.id === PULLED_LICENSE_PLAN,
		);
		const liveLinks = await planLicenseRepo.listWithLicensePlanIdByParents({
			db,
			parentInternalProductIds: [liveBase?.internal_id as string],
		});

		// The reused link resolves to the pre-existing target license; the pulled
		// license is copied in and linked.
		expect(liveLinks).toHaveLength(2);
		expect(
			liveLinks.find((link) => link.licensePlanId === REUSED_LICENSE_PLAN)
				?.planLicense.license_internal_product_id,
		).toBe(reusedTargetLicense.internal_id);
		expect(livePulledLicense).toBeDefined();
		expect(
			liveLinks.find((link) => link.licensePlanId === PULLED_LICENSE_PLAN)
				?.planLicense.license_internal_product_id,
		).toBe(livePulledLicense?.internal_id as string);

		const liveFeatures = await FeatureService.list({
			db,
			orgId: org?.id as string,
			env: AppEnv.Live,
		});
		expect(liveFeatures.map((f) => f.id)).toContain(PULLED_LICENSE_FEATURE);
	});
});
