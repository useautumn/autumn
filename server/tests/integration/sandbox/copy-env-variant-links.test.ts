import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { AppEnv, type FullProduct, type Organization } from "@autumn/shared";
import {
	ctxForOrgEnv,
	insertCopyTestOrg,
	seedCopyTestPlan,
} from "@tests/utils/fixtures/copyEnvFixtures.js";
import { initDrizzle } from "@/db/initDrizzle.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { deletePlatformSubOrg } from "@/internal/orgs/deleteOrg/deletePlatformSubOrg.js";
import { handleCopyProducts } from "@/internal/products/handlers/handleCopyEnvironment/handleCopyProducts.js";
import { ProductService } from "@/internal/products/ProductService.js";

// Copying an env (sandbox -> live, as "copy to production" does) must preserve
// the variant -> base plan link, remapped to the target env's base product.

const { db } = initDrizzle();
const suffix = crypto.randomUUID().slice(0, 8);

const BASE_PLAN = `cvl_base_${suffix}`;
const VARIANT_PLAN = `cvl_variant_${suffix}`;
const SOLO_BASE_PLAN = `cvl_solo_base_${suffix}`;
const SOLO_VARIANT_PLAN = `cvl_solo_variant_${suffix}`;
const REPAIR_BASE_PLAN = `cvl_repair_base_${suffix}`;
const REPAIR_VARIANT_PLAN = `cvl_repair_variant_${suffix}`;
const COLLIDE_OTHER_PLAN = `cvl_collide_other_${suffix}`;
const COLLIDE_BASE_PLAN = `cvl_collide_base_${suffix}`;
const COLLIDE_VARIANT_PLAN = `cvl_collide_variant_${suffix}`;

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
	seedCopyTestPlan({ db, ctx: ctxForEnv(env), planId, baseInternalProductId });

const listLivePlans = async (): Promise<FullProduct[]> =>
	ProductService.listFull({
		db,
		orgId: org?.id as string,
		env: AppEnv.Live,
		returnAll: true,
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
	org = await insertCopyTestOrg({ db, name: `cvl-org-${suffix}` });
	const base = await seedPlan({ env: AppEnv.Sandbox, planId: BASE_PLAN });
	await seedPlan({
		env: AppEnv.Sandbox,
		planId: VARIANT_PLAN,
		baseInternalProductId: base.internal_id,
	});
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
	test("full env copy links the copied variant to the copied base", async () => {
		await copyToLive([BASE_PLAN, VARIANT_PLAN]);

		const livePlans = await listLivePlans();
		const liveBase = livePlans.find((p) => p.id === BASE_PLAN);
		const liveVariant = livePlans.find((p) => p.id === VARIANT_PLAN);

		expect(liveBase).toBeDefined();
		expect(liveVariant).toBeDefined();
		expect(liveVariant?.base_internal_product_id).toBe(
			liveBase?.internal_id as string,
		);
	});

	test("copying a variant alone pulls its base into the target env", async () => {
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
