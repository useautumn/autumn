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
import { deletePlatformSubOrg } from "@/internal/orgs/deleteOrg/deletePlatformSubOrg.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { createProduct } from "@/internal/product/actions/createProduct.js";
import { handleCopyProducts } from "@/internal/products/handlers/handleCopyEnvironment/handleCopyProducts.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { generatePublishableKey } from "@/utils/encryptUtils.js";
import { generateId } from "@/utils/genUtils.js";

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
		slug: `cvl-${crypto.randomUUID()}`,
		name: `cvl-org-${suffix}`,
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

const seedPlan = async ({
	env,
	planId,
	baseInternalProductId,
}: {
	env: AppEnv;
	planId: string;
	baseInternalProductId?: string;
}): Promise<FullProduct> => {
	await createProduct({
		ctx: ctxForEnv(env),
		data: {
			...(products.base({ id: planId, items: [] }) as unknown as Omit<
				CreateProductV2Params,
				"base_internal_product_id"
			>),
			base_internal_product_id: baseInternalProductId ?? null,
		},
	});
	// The real API invalidates via route middleware; direct calls must do it.
	await invalidateProductsCache({ orgId: org?.id as string, env });
	return ProductService.getFull({
		db,
		idOrInternalId: planId,
		orgId: org?.id as string,
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
	org = await insertOrg();
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
