import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
	AppEnv,
	type CreateProductV2Params,
	type FullProduct,
	type Organization,
	type OrgConfig,
	organizations,
} from "@autumn/shared";
import { products } from "@tests/utils/fixtures/products.js";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import { initDrizzle } from "@/db/initDrizzle.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import { invalidateProductsCache } from "@/external/redis/actions/productsCache/productsCache.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { createFeature } from "@/internal/features/featureActions/createFeature.js";
import { constructBooleanFeature } from "@/internal/features/utils/constructFeatureUtils.js";
import { deletePlatformSubOrg } from "@/internal/orgs/deleteOrg/deletePlatformSubOrg.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { createProduct } from "@/internal/product/actions/createProduct.js";
import { copyProductForOrgs } from "@/internal/products/handlers/handleCopyProduct/copyProductForOrgs.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { generatePublishableKey } from "@/utils/encryptUtils.js";
import { generateId } from "@/utils/genUtils.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";

// Copying a single base plan (the "Copy Plan to Production" dialog) must carry
// the base's variants along, relinked to the newly copied base.

const { db } = initDrizzle();
const suffix = crypto.randomUUID().slice(0, 8);

const BASE_FEATURE = `cpv_base_feat_${suffix}`;
const VARIANT_FEATURE = `cpv_variant_feat_${suffix}`;

const BASE_PLAN = `cpv_base_${suffix}`;
const VARIANT_PLAN = `cpv_variant_${suffix}`;
const RENAME_BASE_PLAN = `cpv_rename_base_${suffix}`;
const RENAME_TARGET_PLAN = `cpv_rename_target_${suffix}`;
const RENAME_VARIANT_PLAN = `cpv_rename_variant_${suffix}`;
const CONFLICT_BASE_PLAN = `cpv_conflict_base_${suffix}`;
const CONFLICT_TAKEN_PLAN = `cpv_conflict_taken_${suffix}`;
const CONFLICT_FREE_PLAN = `cpv_conflict_free_${suffix}`;

let org: Organization | undefined;

const baseCtx = { ...defaultCtx } as AutumnContext;

const ctxForEnv = (env: AppEnv): AutumnContext => {
	if (!org) throw new Error("org not provisioned");
	return { ...baseCtx, org, env, features: [] };
};

const insertOrg = async (): Promise<Organization> => {
	const orgId = generateId("org");
	await db.insert(organizations).values({
		id: orgId,
		slug: `cpv-${crypto.randomUUID()}`,
		name: `cpv-org-${suffix}`,
		createdAt: new Date(),
		created_at: Date.now(),
		created_by: null,
		is_sandbox: false,
		stripe_connected: false,
		default_currency: "usd",
		config: {} as OrgConfig,
		onboarded: true,
		test_pkey: generatePublishableKey(AppEnv.Sandbox),
		live_pkey: generatePublishableKey(AppEnv.Live),
	});
	return OrgService.get({ db, orgId });
};

const seedFeature = async ({ featureId }: { featureId: string }) => {
	if (!org) throw new Error("org not provisioned");
	await createFeature({
		ctx: ctxForEnv(AppEnv.Sandbox),
		data: constructBooleanFeature({
			featureId,
			orgId: org.id,
			env: AppEnv.Sandbox,
		}),
		skipGenerateDisplay: true,
	});
};

const seedPlan = async ({
	env,
	planId,
	featureIds = [],
	baseInternalProductId,
}: {
	env: AppEnv;
	planId: string;
	featureIds?: string[];
	baseInternalProductId?: string;
}): Promise<FullProduct> => {
	if (!org) throw new Error("org not provisioned");
	const features = await FeatureService.list({ db, orgId: org.id, env });
	await createProduct({
		ctx: { ...ctxForEnv(env), features },
		data: {
			...(products.base({
				id: planId,
				items: featureIds.map((featureId) =>
					constructFeatureItem({ featureId, isBoolean: true }),
				),
			}) as unknown as Omit<CreateProductV2Params, "base_internal_product_id">),
			base_internal_product_id: baseInternalProductId ?? null,
		},
	});
	// The real API invalidates via route middleware; direct calls must do it.
	await invalidateProductsCache({ orgId: org.id, env });
	return ProductService.getFull({
		db,
		idOrInternalId: planId,
		orgId: org.id,
		env,
	});
};

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
		ctx: baseCtx,
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
	org = await insertOrg();
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
	test("copies variants and relinks them to the copied base", async () => {
		const base = await seedPlan({
			env: AppEnv.Sandbox,
			planId: BASE_PLAN,
			featureIds: [BASE_FEATURE],
		});
		await seedPlan({
			env: AppEnv.Sandbox,
			planId: VARIANT_PLAN,
			featureIds: [VARIANT_FEATURE],
			baseInternalProductId: base.internal_id,
		});

		await copyPlanToLive({
			fromProductId: BASE_PLAN,
			toId: BASE_PLAN,
			toName: "Copied Base",
		});

		const livePlans = await listLivePlans();
		const liveBase = livePlans.find((p) => p.id === BASE_PLAN);
		const liveVariant = livePlans.find((p) => p.id === VARIANT_PLAN);

		expect(liveBase).toBeDefined();
		expect(liveVariant).toBeDefined();
		expect(liveVariant?.base_internal_product_id).toBe(
			liveBase?.internal_id as string,
		);

		// The variant's own entitlement feature must come along too.
		const liveFeatures = await FeatureService.list({
			db,
			orgId: org?.id as string,
			env: AppEnv.Live,
		});
		expect(liveFeatures.map((f) => f.id)).toContain(VARIANT_FEATURE);
	});

	test("renaming the base leaves variant ids and names untouched", async () => {
		const base = await seedPlan({
			env: AppEnv.Sandbox,
			planId: RENAME_BASE_PLAN,
		});
		const variant = await seedPlan({
			env: AppEnv.Sandbox,
			planId: RENAME_VARIANT_PLAN,
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
});
