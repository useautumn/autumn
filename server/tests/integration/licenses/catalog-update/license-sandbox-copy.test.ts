import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
	AppEnv,
	type CreateProductV2Params,
	ErrCode,
	FeatureUsageType,
	mapToProductV2,
	type Organization,
	type OrgConfig,
	organizations,
	RecaseError,
} from "@autumn/shared";
import { products } from "@tests/utils/fixtures/products.js";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import { initDrizzle } from "@/db/initDrizzle.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { createFeature } from "@/internal/features/featureActions/createFeature.js";
import {
	constructAiCreditSystem,
	constructBooleanFeature,
	constructCreditSystem,
	constructMeteredFeature,
} from "@/internal/features/utils/constructFeatureUtils.js";
import { syncPlanLicenses } from "@/internal/licenses/actions/links/syncPlanLicenses.js";
import { planLicenseRepo } from "@/internal/licenses/repos/planLicenseRepo.js";
import { deletePlatformSubOrg } from "@/internal/orgs/deleteOrg/deletePlatformSubOrg.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { createProduct } from "@/internal/product/actions/createProduct.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { copySandboxForOrg } from "@/internal/sandboxes/copySandbox.js";
import { generatePublishableKey } from "@/utils/encryptUtils.js";
import { generateId } from "@/utils/genUtils.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";

// Drives copySandboxForOrg directly (the route is dashboard-only, so a
// secret-key HTTP call is rejected by assertDashboardActor). Seeds the source
// sandbox via the same createFeature/createProduct actions the copy engine
// uses, then asserts the target sub-org receives the plans + features. No dev
// server required — pure DB + action layer.
//
// Sandbox sub-orgs are inserted directly (is_sandbox=true, created_by=master)
// instead of via createSandboxForOrg: real sandbox creation provisions a Stripe
// connect account, which the copy feature is independent of. The inserted rows
// carry the exact ownership shape getOwnedSandbox/assertSandboxAccess check.

const { db } = initDrizzle();

const MSG_FEATURE = "copy_messages";
const DASH_FEATURE = "copy_dashboard";
const CREDIT_FEATURE = "copy_credits";
const AI_CREDIT_FEATURE = "copy_ai_credits";
const PRODUCT_ID = "copy_pro";
const LICENSE_ID = "copy_license";

const suffix = crypto.randomUUID().slice(0, 8);

let source: Organization | undefined;
let target: Organization | undefined;
const extraTargets: Organization[] = [];

const baseCtx = { ...defaultCtx } as AutumnContext;

const insertSandboxSubOrg = async ({
	masterOrgId,
	name,
}: {
	masterOrgId: string;
	name: string;
}): Promise<Organization> => {
	const orgId = generateId("org");
	const slug = `${name}-${crypto.randomUUID()}|${masterOrgId}`;
	await db.insert(organizations).values({
		id: orgId,
		slug,
		name,
		createdAt: new Date(),
		created_at: Date.now(),
		created_by: masterOrgId,
		is_sandbox: true,
		stripe_connected: false,
		default_currency: "usd",
		config: {} as OrgConfig,
		onboarded: true,
		test_pkey: generatePublishableKey(AppEnv.Sandbox),
		live_pkey: generatePublishableKey(AppEnv.Live),
	});
	return OrgService.get({ db, orgId });
};

const seedSourceSandbox = async (sourceOrg: Organization) => {
	const seedCtx: AutumnContext = {
		...baseCtx,
		org: sourceOrg,
		env: AppEnv.Sandbox,
		features: [],
	};

	const messages = constructMeteredFeature({
		featureId: MSG_FEATURE,
		orgId: sourceOrg.id,
		env: AppEnv.Sandbox,
		usageType: FeatureUsageType.Single,
	});
	const dashboard = constructBooleanFeature({
		featureId: DASH_FEATURE,
		orgId: sourceOrg.id,
		env: AppEnv.Sandbox,
	});

	await createFeature({
		ctx: seedCtx,
		data: messages,
		skipGenerateDisplay: true,
	});
	await createFeature({
		ctx: seedCtx,
		data: dashboard,
		skipGenerateDisplay: true,
	});

	// Credit system references the metered feature; created after it so the
	// schema reference resolves (mirrors handleCopyFeatures' batching).
	const afterMetered = await FeatureService.list({
		db,
		orgId: sourceOrg.id,
		env: AppEnv.Sandbox,
	});
	const credits = constructCreditSystem({
		featureId: CREDIT_FEATURE,
		orgId: sourceOrg.id,
		env: AppEnv.Sandbox,
		schema: [{ metered_feature_id: MSG_FEATURE, credit_cost: 1 }],
	});
	await createFeature({
		ctx: { ...seedCtx, features: afterMetered },
		data: credits,
		skipGenerateDisplay: true,
	});

	const aiCredits = constructAiCreditSystem({
		featureId: AI_CREDIT_FEATURE,
		orgId: sourceOrg.id,
		env: AppEnv.Sandbox,
		modelMarkups: {
			"anthropic/claude-3-5-haiku-20241022": { markup: 20 },
		},
	});
	await createFeature({
		ctx: { ...seedCtx, features: afterMetered },
		data: aiCredits,
		skipGenerateDisplay: true,
	});

	const allFeatures = await FeatureService.list({
		db,
		orgId: sourceOrg.id,
		env: AppEnv.Sandbox,
	});

	const product = products.base({
		id: PRODUCT_ID,
		items: [
			constructFeatureItem({ featureId: DASH_FEATURE, isBoolean: true }),
			constructFeatureItem({ featureId: MSG_FEATURE, includedUsage: 100 }),
		],
	});

	await createProduct({
		ctx: { ...seedCtx, features: allFeatures },
		data: product as unknown as CreateProductV2Params,
	});
	await createProduct({
		ctx: { ...seedCtx, features: allFeatures },
		data: products.base({
			id: LICENSE_ID,
			items: [
				constructFeatureItem({ featureId: MSG_FEATURE, includedUsage: 25 }),
			],
		}) as unknown as CreateProductV2Params,
	});
	const parentProduct = await ProductService.getFull({
		db,
		orgId: sourceOrg.id,
		env: AppEnv.Sandbox,
		idOrInternalId: PRODUCT_ID,
	});
	await syncPlanLicenses({
		ctx: { ...seedCtx, features: allFeatures },
		parentProduct,
		licenses: [
			{
				license_plan_id: LICENSE_ID,
				included: 3,
				prepaid_only: true,
				metadata: { source: "sandbox-copy" },
			},
		],
	});
};

beforeAll(async () => {
	source = await insertSandboxSubOrg({
		masterOrgId: defaultCtx.org.id,
		name: `copy-source-${suffix}`,
	});
	target = await insertSandboxSubOrg({
		masterOrgId: defaultCtx.org.id,
		name: `copy-target-${suffix}`,
	});

	await seedSourceSandbox(source);
}, 180_000);

afterAll(async () => {
	for (const created of [source, target, ...extraTargets]) {
		if (created) {
			await deletePlatformSubOrg({
				db,
				org: created,
				logger,
				skipLiveCustomerCheck: true,
			}).catch(() => {});
		}
	}
}, 180_000);

describe("sandboxes.copy: copy plans + features between two sandbox sub-orgs", () => {
	test("copies the source sandbox's features + product into the target sandbox", async () => {
		if (!source || !target) throw new Error("sandboxes not provisioned");

		// Sanity: target starts empty.
		const targetFeaturesBefore = await FeatureService.list({
			db,
			orgId: target.id,
			env: AppEnv.Sandbox,
		});
		const targetProductsBefore = await ProductService.listFull({
			db,
			orgId: target.id,
			env: AppEnv.Sandbox,
		});
		expect(targetFeaturesBefore.length).toBe(0);
		expect(targetProductsBefore.length).toBe(0);

		await copySandboxForOrg({
			db,
			ctx: baseCtx,
			masterOrg: defaultCtx.org,
			fromSandboxId: source.id,
			toSandboxId: target.id,
		});

		const targetFeatures = await FeatureService.list({
			db,
			orgId: target.id,
			env: AppEnv.Sandbox,
		});
		const targetProducts = await ProductService.listFull({
			db,
			orgId: target.id,
			env: AppEnv.Sandbox,
		});

		// All three feature types copied across the org boundary.
		expect(targetFeatures.map((f) => f.id).sort()).toEqual(
			[AI_CREDIT_FEATURE, CREDIT_FEATURE, DASH_FEATURE, MSG_FEATURE].sort(),
		);

		// The product copied, and its items still reference the copied features.
		const copied = targetProducts.find((p) => p.id === PRODUCT_ID);
		expect(copied).toBeDefined();

		const copiedV2 = mapToProductV2({
			product: copied!,
			features: targetFeatures,
		});
		const itemFeatureIds = copiedV2.items
			.map((i) => i.feature_id)
			.filter((id): id is string => Boolean(id));
		expect(itemFeatureIds.sort()).toEqual([DASH_FEATURE, MSG_FEATURE].sort());

		const links = copied!.licenses ?? [];
		expect(links).toHaveLength(1);
		// DB plan licenses carry internal ids; the public id is on the product.
		expect(links[0]).toMatchObject({
			included: 3,
			product: expect.objectContaining({ id: LICENSE_ID }),
		});
		const [storedLink] =
			await planLicenseRepo.listCatalogByParentInternalProductIds({
				db,
				parentInternalProductIds: [copied!.internal_id],
			});
		expect(storedLink.metadata).toEqual({ source: "sandbox-copy" });
	}, 180_000);

	test("rejects a non-owned source with a 404 (ownership masked)", async () => {
		if (!target) throw new Error("sandbox not provisioned");

		let caught: unknown;
		try {
			await copySandboxForOrg({
				db,
				ctx: baseCtx,
				masterOrg: defaultCtx.org,
				fromSandboxId: `org_${crypto.randomUUID()}`,
				toSandboxId: target.id,
			});
		} catch (error) {
			caught = error;
		}

		expect(caught).toBeInstanceOf(RecaseError);
		expect((caught as RecaseError).code).toBe(ErrCode.OrgNotFound);
		expect((caught as RecaseError).statusCode).toBe(404);
	});

	test("rejects a non-owned target with a 404 (ownership masked)", async () => {
		if (!source) throw new Error("sandbox not provisioned");

		let caught: unknown;
		try {
			await copySandboxForOrg({
				db,
				ctx: baseCtx,
				masterOrg: defaultCtx.org,
				fromSandboxId: source.id,
				toSandboxId: `org_${crypto.randomUUID()}`,
			});
		} catch (error) {
			caught = error;
		}

		expect(caught).toBeInstanceOf(RecaseError);
		expect((caught as RecaseError).code).toBe(ErrCode.OrgNotFound);
		expect((caught as RecaseError).statusCode).toBe(404);
	});

	test("never targets the master org's live catalog (master id reads as 404)", async () => {
		if (!source) throw new Error("sandbox not provisioned");

		// The master org is a real org but is not a sandbox sub-org, so the
		// ownership check folds it into the same uniform 404 — proving the copy
		// can't be aimed at any org's live catalog.
		let caught: unknown;
		try {
			await copySandboxForOrg({
				db,
				ctx: baseCtx,
				masterOrg: defaultCtx.org,
				fromSandboxId: source.id,
				toSandboxId: defaultCtx.org.id,
			});
		} catch (error) {
			caught = error;
		}

		expect(caught).toBeInstanceOf(RecaseError);
		expect((caught as RecaseError).code).toBe(ErrCode.OrgNotFound);
		expect((caught as RecaseError).statusCode).toBe(404);
	});

	test("rejects a self-copy (same source and target) with a 400", async () => {
		if (!source) throw new Error("source not provisioned");

		let caught: unknown;
		try {
			await copySandboxForOrg({
				db,
				ctx: baseCtx,
				masterOrg: defaultCtx.org,
				fromSandboxId: source.id,
				toSandboxId: source.id,
			});
		} catch (error) {
			caught = error;
		}

		expect(caught).toBeInstanceOf(RecaseError);
		expect((caught as RecaseError).code).toBe(ErrCode.InvalidRequest);
		expect((caught as RecaseError).statusCode).toBe(400);
	});
});

describe("sandboxes.copy: selective copy via productIds / featureIds", () => {
	const freshTarget = async (label: string) => {
		const dst = await insertSandboxSubOrg({
			masterOrgId: defaultCtx.org.id,
			name: `copy-sel-${label}-${suffix}`,
		});
		extraTargets.push(dst);
		return dst;
	};

	test("productIds copies only that product plus the features it references", async () => {
		if (!source) throw new Error("source not provisioned");
		const dst = await freshTarget("prod");

		await copySandboxForOrg({
			db,
			ctx: baseCtx,
			masterOrg: defaultCtx.org,
			fromSandboxId: source.id,
			toSandboxId: dst.id,
			productIds: [PRODUCT_ID],
		});

		const features = await FeatureService.list({
			db,
			orgId: dst.id,
			env: AppEnv.Sandbox,
		});
		const dstProducts = await ProductService.listFull({
			db,
			orgId: dst.id,
			env: AppEnv.Sandbox,
		});

		// The one product copied; its referenced features (dashboard + messages)
		// auto-included; the unrelated credit system is NOT pulled in.
		expect(dstProducts.map((p) => p.id)).toEqual([PRODUCT_ID]);
		expect(features.map((f) => f.id).sort()).toEqual(
			[DASH_FEATURE, MSG_FEATURE].sort(),
		);
	}, 180_000);

	test("featureIds copies only those features and no products", async () => {
		if (!source) throw new Error("source not provisioned");
		const dst = await freshTarget("feat");

		await copySandboxForOrg({
			db,
			ctx: baseCtx,
			masterOrg: defaultCtx.org,
			fromSandboxId: source.id,
			toSandboxId: dst.id,
			featureIds: [DASH_FEATURE],
		});

		const features = await FeatureService.list({
			db,
			orgId: dst.id,
			env: AppEnv.Sandbox,
		});
		const dstProducts = await ProductService.listFull({
			db,
			orgId: dst.id,
			env: AppEnv.Sandbox,
		});

		expect(features.map((f) => f.id)).toEqual([DASH_FEATURE]);
		expect(dstProducts.length).toBe(0);
	}, 180_000);

	test("a requested featureId absent from the source is rejected", async () => {
		if (!source) throw new Error("source not provisioned");
		const dst = await freshTarget("missing-feat");

		let thrown: unknown;
		try {
			await copySandboxForOrg({
				db,
				ctx: baseCtx,
				masterOrg: defaultCtx.org,
				fromSandboxId: source.id,
				toSandboxId: dst.id,
				featureIds: ["does_not_exist"],
			});
		} catch (error) {
			thrown = error;
		}
		expect(thrown).toBeInstanceOf(RecaseError);
		expect((thrown as RecaseError).code).toBe(ErrCode.FeatureNotFound);
	}, 180_000);

	test("a credit-system featureId pulls in the metered feature it references", async () => {
		if (!source) throw new Error("source not provisioned");
		const dst = await freshTarget("credit");

		await copySandboxForOrg({
			db,
			ctx: baseCtx,
			masterOrg: defaultCtx.org,
			fromSandboxId: source.id,
			toSandboxId: dst.id,
			featureIds: [CREDIT_FEATURE],
		});

		const features = await FeatureService.list({
			db,
			orgId: dst.id,
			env: AppEnv.Sandbox,
		});

		// Credit system + the metered feature its schema references, nothing else.
		expect(features.map((f) => f.id).sort()).toEqual(
			[CREDIT_FEATURE, MSG_FEATURE].sort(),
		);
	}, 180_000);
});

describe("sandboxes.copy: edge cases", () => {
	const freshOrg = async (label: string) => {
		const org = await insertSandboxSubOrg({
			masterOrgId: defaultCtx.org.id,
			name: `copy-edge-${label}-${suffix}`,
		});
		extraTargets.push(org);
		return org;
	};

	test("overwrites matching-id items in the target and re-copy is idempotent", async () => {
		if (!source) throw new Error("source not provisioned");
		const dst = await freshOrg("overwrite");

		const seedCtx: AutumnContext = {
			...baseCtx,
			org: dst,
			env: AppEnv.Sandbox,
			features: [],
		};
		await createFeature({
			ctx: seedCtx,
			data: constructBooleanFeature({
				featureId: DASH_FEATURE,
				orgId: dst.id,
				env: AppEnv.Sandbox,
				name: "Stale Dashboard",
			}),
			skipGenerateDisplay: true,
		});
		const targetFeaturesBefore = await FeatureService.list({
			db,
			orgId: dst.id,
			env: AppEnv.Sandbox,
		});
		await createProduct({
			ctx: { ...seedCtx, features: targetFeaturesBefore },
			data: products.base({
				id: PRODUCT_ID,
				items: [],
			}) as unknown as CreateProductV2Params,
		});

		await copySandboxForOrg({
			db,
			ctx: baseCtx,
			masterOrg: defaultCtx.org,
			fromSandboxId: source.id,
			toSandboxId: dst.id,
		});

		const featsAfter = await FeatureService.list({
			db,
			orgId: dst.id,
			env: AppEnv.Sandbox,
		});
		const dash = featsAfter.find((f) => f.id === DASH_FEATURE);
		expect(dash).toBeDefined();
		expect(dash?.name).not.toBe("Stale Dashboard");

		const prodsAfter = await ProductService.listFull({
			db,
			orgId: dst.id,
			env: AppEnv.Sandbox,
		});
		const matching = prodsAfter.filter((p) => p.id === PRODUCT_ID);
		expect(matching.length).toBe(1);
		const copiedV2 = mapToProductV2({
			product: matching[0],
			features: featsAfter,
		});
		const itemFeatureIds = copiedV2.items
			.map((i) => i.feature_id)
			.filter((id): id is string => Boolean(id));
		expect(itemFeatureIds.sort()).toEqual([DASH_FEATURE, MSG_FEATURE].sort());

		await copySandboxForOrg({
			db,
			ctx: baseCtx,
			masterOrg: defaultCtx.org,
			fromSandboxId: source.id,
			toSandboxId: dst.id,
		});

		const featsAgain = await FeatureService.list({
			db,
			orgId: dst.id,
			env: AppEnv.Sandbox,
		});
		const prodsAgain = await ProductService.listFull({
			db,
			orgId: dst.id,
			env: AppEnv.Sandbox,
		});
		expect(featsAgain.map((f) => f.id).sort()).toEqual(
			featsAfter.map((f) => f.id).sort(),
		);
		expect(prodsAgain.filter((p) => p.id === PRODUCT_ID).length).toBe(1);
	}, 180_000);

	test("productIds: [] and featureIds: [] copies nothing", async () => {
		if (!source) throw new Error("source not provisioned");
		const dst = await freshOrg("empty-filters");

		await copySandboxForOrg({
			db,
			ctx: baseCtx,
			masterOrg: defaultCtx.org,
			fromSandboxId: source.id,
			toSandboxId: dst.id,
			productIds: [],
			featureIds: [],
		});

		const features = await FeatureService.list({
			db,
			orgId: dst.id,
			env: AppEnv.Sandbox,
		});
		const dstProducts = await ProductService.listFull({
			db,
			orgId: dst.id,
			env: AppEnv.Sandbox,
		});
		expect(features.length).toBe(0);
		expect(dstProducts.length).toBe(0);
	}, 180_000);

	test("copying from an empty source succeeds and copies nothing", async () => {
		const emptySource = await freshOrg("empty-src");
		const dst = await freshOrg("empty-dst");

		await copySandboxForOrg({
			db,
			ctx: baseCtx,
			masterOrg: defaultCtx.org,
			fromSandboxId: emptySource.id,
			toSandboxId: dst.id,
		});

		const features = await FeatureService.list({
			db,
			orgId: dst.id,
			env: AppEnv.Sandbox,
		});
		const dstProducts = await ProductService.listFull({
			db,
			orgId: dst.id,
			env: AppEnv.Sandbox,
		});
		expect(features.length).toBe(0);
		expect(dstProducts.length).toBe(0);
	}, 180_000);
});
