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
import { planLicenseRepo } from "@/internal/licenses/repos/planLicenseRepo.js";
import { deletePlatformSubOrg } from "@/internal/orgs/deleteOrg/deletePlatformSubOrg.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { createProduct } from "@/internal/product/actions/createProduct.js";
import { handleCopyProducts } from "@/internal/products/handlers/handleCopyEnvironment/handleCopyProducts.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { generatePublishableKey } from "@/utils/encryptUtils.js";
import { generateId } from "@/utils/genUtils.js";

/**
 * TDD test: copying an env (sandbox -> live, as "copy to production" does) must
 * carry over catalog plan license links.
 *
 * Contract under test:
 *   New behaviors (handleCopyProducts):
 *     - copy set includes parent + license -> target has a plan_licenses row
 *       linking the copied pair, preserving included / prepaid_only / metadata
 *     - copying a parent alone -> its license product is pulled into the copy
 *       set and the link is recreated (same pattern as variant bases)
 *     - copying a parent whose license already exists in the target -> the link
 *       resolves against the existing target license, no duplicate product
 *     - re-copy when both products exist in the target without the link -> the
 *       link is repaired
 *   Side effects:
 *     - catalog (is_custom = false) rows in plan_licenses in the target env
 */

const { db } = initDrizzle();
const suffix = crypto.randomUUID().slice(0, 8);

const FULL_PARENT = `cll_full_parent_${suffix}`;
const FULL_LICENSE = `cll_full_license_${suffix}`;
const PULL_PARENT = `cll_pull_parent_${suffix}`;
const PULL_LICENSE = `cll_pull_license_${suffix}`;
const EXIST_PARENT = `cll_exist_parent_${suffix}`;
const EXIST_LICENSE = `cll_exist_license_${suffix}`;
const REPAIR_PARENT = `cll_repair_parent_${suffix}`;
const REPAIR_LICENSE = `cll_repair_license_${suffix}`;

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
		slug: `cll-${crypto.randomUUID()}`,
		name: `cll-org-${suffix}`,
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
}: {
	env: AppEnv;
	planId: string;
}): Promise<FullProduct> => {
	await createProduct({
		ctx: ctxForEnv(env),
		data: products.base({ id: planId, items: [] }) as CreateProductV2Params,
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

const seedLinkedPair = async ({
	parentId,
	licenseId,
	included = 1,
	prepaidOnly = false,
	metadata,
}: {
	parentId: string;
	licenseId: string;
	included?: number;
	prepaidOnly?: boolean;
	metadata?: Record<string, unknown>;
}): Promise<{ parent: FullProduct; license: FullProduct }> => {
	const parent = await seedPlan({ env: AppEnv.Sandbox, planId: parentId });
	const license = await seedPlan({ env: AppEnv.Sandbox, planId: licenseId });
	await planLicenseRepo.upsert({
		db,
		parentInternalProductId: parent.internal_id,
		licenseInternalProductId: license.internal_id,
		included,
		prepaidOnly,
		metadata,
	});
	return { parent, license };
};

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
	org = await insertOrg();
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

describe("copying an env carries over plan license links", () => {
	test("copying parent + license recreates the link with its attributes", async () => {
		await seedLinkedPair({
			parentId: FULL_PARENT,
			licenseId: FULL_LICENSE,
			included: 3,
			prepaidOnly: true,
			metadata: { source: "tdd" },
		});

		await copyToLive([FULL_PARENT, FULL_LICENSE]);

		const liveParent = await getLivePlan(FULL_PARENT);
		const liveLicense = await getLivePlan(FULL_LICENSE);
		const links = await listLiveLinks(liveParent);

		expect(links).toHaveLength(1);
		expect(links[0].license_internal_product_id).toBe(liveLicense.internal_id);
		expect(links[0].included).toBe(3);
		expect(links[0].prepaid_only).toBe(true);
		expect(links[0].metadata).toEqual({ source: "tdd" });
	});

	test("copying a parent alone pulls its license into the target env", async () => {
		await seedLinkedPair({
			parentId: PULL_PARENT,
			licenseId: PULL_LICENSE,
		});

		await copyToLive([PULL_PARENT]);

		const liveParent = await getLivePlan(PULL_PARENT);
		const liveLicense = await getLivePlan(PULL_LICENSE);
		const links = await listLiveLinks(liveParent);

		expect(liveLicense).toBeDefined();
		expect(links).toHaveLength(1);
		expect(links[0].license_internal_product_id).toBe(liveLicense.internal_id);
	});

	test("copying a parent links to a license that already exists in the target", async () => {
		await seedLinkedPair({
			parentId: EXIST_PARENT,
			licenseId: EXIST_LICENSE,
		});
		await createProduct({
			ctx: ctxForEnv(AppEnv.Live),
			data: products.base({
				id: EXIST_LICENSE,
				items: [],
			}) as CreateProductV2Params,
		});
		await invalidateProductsCache({
			orgId: org?.id as string,
			env: AppEnv.Live,
		});
		const preExistingLicense = await getLivePlan(EXIST_LICENSE);

		await copyToLive([EXIST_PARENT]);

		const liveParent = await getLivePlan(EXIST_PARENT);
		const liveLicense = await getLivePlan(EXIST_LICENSE);
		const links = await listLiveLinks(liveParent);

		expect(liveLicense.internal_id).toBe(preExistingLicense.internal_id);
		expect(links).toHaveLength(1);
		expect(links[0].license_internal_product_id).toBe(liveLicense.internal_id);
	});

	test("re-copy repairs a missing link when both products exist in the target", async () => {
		await seedLinkedPair({
			parentId: REPAIR_PARENT,
			licenseId: REPAIR_LICENSE,
		});
		// A pre-fix copy landed both plans in live without the link.
		for (const planId of [REPAIR_PARENT, REPAIR_LICENSE]) {
			await createProduct({
				ctx: ctxForEnv(AppEnv.Live),
				data: products.base({ id: planId, items: [] }) as CreateProductV2Params,
			});
		}
		await invalidateProductsCache({
			orgId: org?.id as string,
			env: AppEnv.Live,
		});
		expect(await listLiveLinks(await getLivePlan(REPAIR_PARENT))).toHaveLength(
			0,
		);

		await copyToLive([REPAIR_PARENT, REPAIR_LICENSE]);

		const liveParent = await getLivePlan(REPAIR_PARENT);
		const liveLicense = await getLivePlan(REPAIR_LICENSE);
		const links = await listLiveLinks(liveParent);

		expect(links).toHaveLength(1);
		expect(links[0].license_internal_product_id).toBe(liveLicense.internal_id);
	});
});
