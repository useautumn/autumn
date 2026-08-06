import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { AppEnv, type FullProduct, type Organization } from "@autumn/shared";
import {
	ctxForOrgEnv,
	insertCopyTestOrg,
	seedCopyTestPlan,
} from "@tests/utils/fixtures/copyEnvFixtures.js";
import { initDrizzle } from "@/db/initDrizzle.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import { invalidateProductsCache } from "@/external/redis/actions/productsCache/productsCache.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { planLicenseRepo } from "@/internal/licenses/repos/planLicenseRepo.js";
import { deletePlatformSubOrg } from "@/internal/orgs/deleteOrg/deletePlatformSubOrg.js";
import { handleCopyProducts } from "@/internal/products/handlers/handleCopyEnvironment/handleCopyProducts.js";
import { ProductService } from "@/internal/products/ProductService.js";

// Copying an env (sandbox -> live, as "deploy to production" does) must carry
// variant -> base links and plan license links, remapped to the target env.

const { db } = initDrizzle();
const suffix = crypto.randomUUID().slice(0, 8);

const SOLO_BASE_PLAN = `cel_solo_base_${suffix}`;
const SOLO_VARIANT_PLAN = `cel_solo_variant_${suffix}`;
const COLLIDE_OTHER_PLAN = `cel_collide_other_${suffix}`;
const COLLIDE_BASE_PLAN = `cel_collide_base_${suffix}`;
const COLLIDE_VARIANT_PLAN = `cel_collide_variant_${suffix}`;
const REPAIR_BASE_PLAN = `cel_repair_base_${suffix}`;
const REPAIR_VARIANT_PLAN = `cel_repair_variant_${suffix}`;

const PULL_PARENT = `cel_pull_parent_${suffix}`;
const PULL_LICENSE = `cel_pull_license_${suffix}`;
const EXIST_PARENT = `cel_exist_parent_${suffix}`;
const EXIST_LICENSE = `cel_exist_license_${suffix}`;
const ARCH_PARENT = `cel_arch_parent_${suffix}`;
const ARCH_LICENSE = `cel_arch_license_${suffix}`;
const RELINK_PARENT = `cel_relink_parent_${suffix}`;
const RELINK_LICENSE = `cel_relink_license_${suffix}`;

let org: Organization | undefined;

const ctxForEnv = (env: AppEnv): AutumnContext => {
	if (!org) throw new Error("org not provisioned");
	return ctxForOrgEnv({ org, env });
};

const seedPlan = ({
	env,
	planId,
	baseInternalProductId,
}: {
	env: AppEnv;
	planId: string;
	baseInternalProductId?: string;
}): Promise<FullProduct> =>
	seedCopyTestPlan({ ctx: ctxForEnv(env), planId, baseInternalProductId });

const seedLinkedPair = async ({
	parentId,
	licenseId,
	included = 1,
	metadata,
}: {
	parentId: string;
	licenseId: string;
	included?: number;
	metadata?: Record<string, unknown>;
}): Promise<{ parent: FullProduct; license: FullProduct }> => {
	const parent = await seedPlan({ env: AppEnv.Sandbox, planId: parentId });
	const license = await seedPlan({ env: AppEnv.Sandbox, planId: licenseId });
	await planLicenseRepo.upsert({
		db,
		parentInternalProductId: parent.internal_id,
		licenseInternalProductId: license.internal_id,
		included,
		// prepaid_only: false is rejected by syncPlanLicenses; only seed valid links.
		prepaidOnly: true,
		metadata,
	});
	return { parent, license };
};

const listLivePlans = async (): Promise<FullProduct[]> =>
	ProductService.listFull({
		db,
		orgId: org?.id as string,
		env: AppEnv.Live,
		returnAll: true,
	});

const getLivePlan = async (planId: string): Promise<FullProduct> =>
	ProductService.getFull({
		db,
		idOrInternalId: planId,
		orgId: org?.id as string,
		env: AppEnv.Live,
	});

const listLiveLinks = async (parent: FullProduct) =>
	planLicenseRepo.listCatalogByParentInternalProductIds({
		db,
		parentInternalProductIds: [parent.internal_id],
	});

const copyToLive = async (productIds?: string[]) => {
	if (!org) throw new Error("org not provisioned");
	await handleCopyProducts({
		ctx: ctxForEnv(AppEnv.Sandbox),
		fromOrg: org,
		fromEnv: AppEnv.Sandbox,
		toOrg: org,
		toEnv: AppEnv.Live,
		productIds,
	});
};

beforeAll(async () => {
	org = await insertCopyTestOrg({ db, name: `cel-org-${suffix}` });
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

describe("copying an env preserves variant base plan links", () => {
	test("copying a variant alone pulls its base and links to it", async () => {
		const soloBase = await seedPlan({
			env: AppEnv.Sandbox,
			planId: SOLO_BASE_PLAN,
		});
		await seedPlan({
			env: AppEnv.Sandbox,
			planId: SOLO_VARIANT_PLAN,
			baseInternalProductId: soloBase.internal_id,
		});

		await copyToLive([SOLO_VARIANT_PLAN]);

		const livePlans = await listLivePlans();
		const liveBase = livePlans.find((p) => p.id === SOLO_BASE_PLAN);
		const liveVariant = livePlans.find((p) => p.id === SOLO_VARIANT_PLAN);

		expect(liveBase).toBeDefined();
		expect(liveVariant?.base_internal_product_id).toBe(
			liveBase?.internal_id as string,
		);
	});

	test("a same-id target variant leaves the copied variant unlinked and untouched", async () => {
		// Live already uses the base's id for a variant of another plan; the copy
		// must neither nest under it nor rewrite it.
		const liveOther = await seedPlan({
			env: AppEnv.Live,
			planId: COLLIDE_OTHER_PLAN,
		});
		const liveCollider = await seedPlan({
			env: AppEnv.Live,
			planId: COLLIDE_BASE_PLAN,
			baseInternalProductId: liveOther.internal_id,
		});
		const sandboxBase = await seedPlan({
			env: AppEnv.Sandbox,
			planId: COLLIDE_BASE_PLAN,
		});
		await seedPlan({
			env: AppEnv.Sandbox,
			planId: COLLIDE_VARIANT_PLAN,
			baseInternalProductId: sandboxBase.internal_id,
		});

		await copyToLive([COLLIDE_VARIANT_PLAN]);

		const livePlans = await listLivePlans();
		const liveVariant = livePlans.find((p) => p.id === COLLIDE_VARIANT_PLAN);
		const liveColliderAfter = livePlans.find((p) => p.id === COLLIDE_BASE_PLAN);

		expect(liveVariant).toBeDefined();
		expect(liveVariant?.base_internal_product_id).toBeNull();
		expect(liveColliderAfter?.base_internal_product_id).toBe(
			liveCollider.base_internal_product_id,
		);
	});

	test("re-copy repairs a previously disconnected variant in the target env", async () => {
		const repairBase = await seedPlan({
			env: AppEnv.Sandbox,
			planId: REPAIR_BASE_PLAN,
		});
		await seedPlan({
			env: AppEnv.Sandbox,
			planId: REPAIR_VARIANT_PLAN,
			baseInternalProductId: repairBase.internal_id,
		});

		// A pre-fix copy landed both plans in live without the link.
		await seedPlan({ env: AppEnv.Live, planId: REPAIR_BASE_PLAN });
		const disconnected = await seedPlan({
			env: AppEnv.Live,
			planId: REPAIR_VARIANT_PLAN,
		});
		expect(disconnected.base_internal_product_id).toBeNull();

		await copyToLive([REPAIR_BASE_PLAN, REPAIR_VARIANT_PLAN]);

		const livePlans = await listLivePlans();
		const liveBase = livePlans.find((p) => p.id === REPAIR_BASE_PLAN);
		const liveVariant = livePlans.find((p) => p.id === REPAIR_VARIANT_PLAN);

		expect(liveVariant?.base_internal_product_id).toBe(
			liveBase?.internal_id as string,
		);
	});
});

describe("copying an env carries plan license links", () => {
	test("copying a parent alone pulls its license and preserves link attributes", async () => {
		await seedLinkedPair({
			parentId: PULL_PARENT,
			licenseId: PULL_LICENSE,
			included: 3,
			metadata: { source: "tdd" },
		});

		await copyToLive([PULL_PARENT]);

		const liveParent = await getLivePlan(PULL_PARENT);
		const liveLicense = await getLivePlan(PULL_LICENSE);
		const links = await listLiveLinks(liveParent);

		expect(links).toHaveLength(1);
		expect(links[0].license_internal_product_id).toBe(liveLicense.internal_id);
		expect(links[0].included).toBe(3);
		expect(links[0].prepaid_only).toBe(true);
		expect(links[0].metadata).toEqual({ source: "tdd" });
	});

	test("copying a parent links to a license that already exists in the target", async () => {
		await seedLinkedPair({ parentId: EXIST_PARENT, licenseId: EXIST_LICENSE });
		const preExistingLicense = await seedPlan({
			env: AppEnv.Live,
			planId: EXIST_LICENSE,
		});

		await copyToLive([EXIST_PARENT]);

		const liveParent = await getLivePlan(EXIST_PARENT);
		const liveLicense = await getLivePlan(EXIST_LICENSE);
		const links = await listLiveLinks(liveParent);

		expect(liveLicense.internal_id).toBe(preExistingLicense.internal_id);
		expect(links).toHaveLength(1);
		expect(links[0].license_internal_product_id).toBe(liveLicense.internal_id);
	});

	test("a link to an archived target license is skipped", async () => {
		await seedLinkedPair({ parentId: ARCH_PARENT, licenseId: ARCH_LICENSE });
		const preExisting = await seedPlan({
			env: AppEnv.Live,
			planId: ARCH_LICENSE,
		});
		await ProductService.updateByInternalId({
			db,
			internalId: preExisting.internal_id,
			update: { archived: true },
		});
		await invalidateProductsCache({
			orgId: org?.id as string,
			env: AppEnv.Live,
		});

		await copyToLive([ARCH_PARENT]);

		const liveParent = await getLivePlan(ARCH_PARENT);
		expect(await listLiveLinks(liveParent)).toHaveLength(0);
	});

	test("re-copy repairs a missing link when both products exist in the target", async () => {
		await seedLinkedPair({
			parentId: RELINK_PARENT,
			licenseId: RELINK_LICENSE,
		});
		// A pre-fix copy landed both plans in live without the link.
		for (const planId of [RELINK_PARENT, RELINK_LICENSE]) {
			await seedPlan({ env: AppEnv.Live, planId });
		}
		expect(await listLiveLinks(await getLivePlan(RELINK_PARENT))).toHaveLength(
			0,
		);

		await copyToLive([RELINK_PARENT, RELINK_LICENSE]);

		const liveParent = await getLivePlan(RELINK_PARENT);
		const liveLicense = await getLivePlan(RELINK_LICENSE);
		const links = await listLiveLinks(liveParent);

		expect(links).toHaveLength(1);
		expect(links[0].license_internal_product_id).toBe(liveLicense.internal_id);
	});
});
