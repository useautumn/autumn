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

/**
 * TDD test: copying an env (sandbox -> live, as "copy to production" does) must
 * carry over catalog plan license links.
 *
 * Contract under test:
 *   New behaviors (handleCopyProducts):
 *     - copy set includes parent + license -> target has a plan_licenses row
 *       linking the copied pair, preserving included / prepaid_only / metadata
 *     - copying a parent alone -> the license plan is pulled into the copy set
 *       and the link is recreated in the target
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
const ARCH_PARENT = `cll_arch_parent_${suffix}`;
const ARCH_LICENSE = `cll_arch_license_${suffix}`;

let org: Organization | undefined;

const ctxForEnv = (env: AppEnv): AutumnContext => {
	if (!org) throw new Error("org not provisioned");
	return ctxForOrgEnv({ org, env });
};

const seedPlan = ({
	env,
	planId,
}: {
	env: AppEnv;
	planId: string;
}): Promise<FullProduct> =>
	seedCopyTestPlan({ db, ctx: ctxForEnv(env), planId });

const seedLinkedPair = async ({
	parentId,
	licenseId,
	included = 1,
	// prepaid_only: false is rejected by syncPlanLicenses; only seed valid links.
	prepaidOnly = true,
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
	org = await insertCopyTestOrg({ db, name: `cll-org-${suffix}` });
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

	test("copying a parent alone pulls its license plan in and links it", async () => {
		await seedLinkedPair({
			parentId: PULL_PARENT,
			licenseId: PULL_LICENSE,
		});

		await copyToLive([PULL_PARENT]);

		const liveParent = await getLivePlan(PULL_PARENT);
		const liveLicense = await getLivePlan(PULL_LICENSE);
		const links = await listLiveLinks(liveParent);

		expect(links).toHaveLength(1);
		expect(links[0].license_internal_product_id).toBe(liveLicense.internal_id);
	});

	test("copying a parent links to a license that already exists in the target", async () => {
		await seedLinkedPair({
			parentId: EXIST_PARENT,
			licenseId: EXIST_LICENSE,
		});
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
		await seedLinkedPair({
			parentId: ARCH_PARENT,
			licenseId: ARCH_LICENSE,
		});
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
			parentId: REPAIR_PARENT,
			licenseId: REPAIR_LICENSE,
		});
		// A pre-fix copy landed both plans in live without the link.
		for (const planId of [REPAIR_PARENT, REPAIR_LICENSE]) {
			await seedPlan({ env: AppEnv.Live, planId });
		}
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
