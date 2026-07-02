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
	products as productsTable,
	RecaseError,
} from "@autumn/shared";
import { products } from "@tests/utils/fixtures/products.js";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import { eq } from "drizzle-orm";
import { initDrizzle } from "@/db/initDrizzle.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { createFeature } from "@/internal/features/featureActions/createFeature.js";
import {
	constructBooleanFeature,
	constructCreditSystem,
	constructMeteredFeature,
} from "@/internal/features/utils/constructFeatureUtils.js";
import { deletePlatformSubOrg } from "@/internal/orgs/deleteOrg/deletePlatformSubOrg.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { createProduct } from "@/internal/product/actions/createProduct.js";
import { copyProductForOrgs } from "@/internal/products/handlers/handleCopyProduct/copyProductForOrgs.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { generatePublishableKey } from "@/utils/encryptUtils.js";
import { generateId } from "@/utils/genUtils.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";

// Exercises the promote path: from inside a named sandbox sub-org, copying a
// plan to Production/Sandbox must land in the MASTER org's env, never the
// sub-org's own (unviewable) Live env. Drives copyProductForOrgs directly with
// explicit from/to orgs (the handler owns the auth gate that decides these).

const { db } = initDrizzle();
const suffix = crypto.randomUUID().slice(0, 8);

const DASH = `promo_dash_${suffix}`;
const MSG = `promo_msg_${suffix}`;
const CREDIT = `promo_credit_${suffix}`;
const PLAN = `promo_plan_${suffix}`;
const CREDIT_PLAN = `promo_credit_plan_${suffix}`;
const BASE_PLAN = `promo_base_${suffix}`;
const VARIANT_PLAN = `promo_variant_${suffix}`;

let master: Organization | undefined;
let sub: Organization | undefined;

const baseCtx = { ...defaultCtx } as AutumnContext;

const insertOrg = async ({
	name,
	isSandbox,
	masterOrgId,
}: {
	name: string;
	isSandbox: boolean;
	masterOrgId: string | null;
}): Promise<Organization> => {
	const orgId = generateId("org");
	const slug = `${name}-${crypto.randomUUID()}`;
	await db.insert(organizations).values({
		id: orgId,
		slug,
		name,
		createdAt: new Date(),
		created_at: Date.now(),
		created_by: masterOrgId,
		is_sandbox: isSandbox,
		stripe_connected: false,
		default_currency: "usd",
		config: {} as OrgConfig,
		onboarded: true,
		test_pkey: generatePublishableKey(AppEnv.Sandbox),
		live_pkey: generatePublishableKey(AppEnv.Live),
	});
	return OrgService.get({ db, orgId });
};

const seedSub = async (sourceOrg: Organization) => {
	const seedCtx: AutumnContext = {
		...baseCtx,
		org: sourceOrg,
		env: AppEnv.Sandbox,
		features: [],
	};

	await createFeature({
		ctx: seedCtx,
		data: constructBooleanFeature({
			featureId: DASH,
			orgId: sourceOrg.id,
			env: AppEnv.Sandbox,
		}),
		skipGenerateDisplay: true,
	});
	await createFeature({
		ctx: seedCtx,
		data: constructMeteredFeature({
			featureId: MSG,
			orgId: sourceOrg.id,
			env: AppEnv.Sandbox,
			usageType: FeatureUsageType.Single,
		}),
		skipGenerateDisplay: true,
	});

	const afterMetered = await FeatureService.list({
		db,
		orgId: sourceOrg.id,
		env: AppEnv.Sandbox,
	});
	await createFeature({
		ctx: { ...seedCtx, features: afterMetered },
		data: constructCreditSystem({
			featureId: CREDIT,
			orgId: sourceOrg.id,
			env: AppEnv.Sandbox,
			schema: [{ metered_feature_id: MSG, credit_cost: 1 }],
		}),
		skipGenerateDisplay: true,
	});

	const allFeatures = await FeatureService.list({
		db,
		orgId: sourceOrg.id,
		env: AppEnv.Sandbox,
	});

	await createProduct({
		ctx: { ...seedCtx, features: allFeatures },
		data: products.base({
			id: PLAN,
			items: [constructFeatureItem({ featureId: DASH, isBoolean: true })],
		}) as unknown as CreateProductV2Params,
	});
	await createProduct({
		ctx: { ...seedCtx, features: allFeatures },
		data: products.base({
			id: CREDIT_PLAN,
			items: [constructFeatureItem({ featureId: CREDIT, includedUsage: 100 })],
		}) as unknown as CreateProductV2Params,
	});

	// A variant plan (base_internal_product_id set) to prove cross-org promote
	// of a variant is refused.
	await createProduct({
		ctx: { ...seedCtx, features: allFeatures },
		data: products.base({
			id: BASE_PLAN,
			items: [],
		}) as unknown as CreateProductV2Params,
	});
	await createProduct({
		ctx: { ...seedCtx, features: allFeatures },
		data: products.base({
			id: VARIANT_PLAN,
			items: [],
		}) as unknown as CreateProductV2Params,
	});
	const seeded = await ProductService.listFull({
		db,
		orgId: sourceOrg.id,
		env: AppEnv.Sandbox,
	});
	const basePlan = seeded.find((p) => p.id === BASE_PLAN);
	await db
		.update(productsTable)
		.set({ base_internal_product_id: basePlan?.internal_id })
		.where(eq(productsTable.internal_id, basePlan?.internal_id ?? ""));
	await db
		.update(productsTable)
		.set({ base_internal_product_id: basePlan?.internal_id })
		.where(
			eq(
				productsTable.internal_id,
				seeded.find((p) => p.id === VARIANT_PLAN)?.internal_id ?? "",
			),
		);
};

beforeAll(async () => {
	master = await insertOrg({
		name: `promo-master-${suffix}`,
		isSandbox: false,
		masterOrgId: null,
	});
	sub = await insertOrg({
		name: `promo-sub-${suffix}`,
		isSandbox: true,
		masterOrgId: master.id,
	});
	await seedSub(sub);
}, 180_000);

afterAll(async () => {
	for (const created of [sub, master]) {
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

describe("promote product from a named sandbox to the master org", () => {
	test("promotes a plan into master Live, not the sub-org's own Live", async () => {
		if (!master || !sub) throw new Error("orgs not provisioned");

		await copyProductForOrgs({
			db,
			logger,
			fromOrg: sub,
			fromEnv: AppEnv.Sandbox,
			toOrg: master,
			toEnv: AppEnv.Live,
			fromProductId: PLAN,
			toId: PLAN,
			toName: "Promoted Plan",
		});

		const masterLiveProducts = await ProductService.listFull({
			db,
			orgId: master.id,
			env: AppEnv.Live,
		});
		const masterLiveFeatures = await FeatureService.list({
			db,
			orgId: master.id,
			env: AppEnv.Live,
		});
		const subLiveProducts = await ProductService.listFull({
			db,
			orgId: sub.id,
			env: AppEnv.Live,
		});

		expect(masterLiveProducts.map((p) => p.id)).toContain(PLAN);
		expect(masterLiveFeatures.map((f) => f.id)).toContain(DASH);
		// The sub-org's own Live env stays empty — the old void target.
		expect(subLiveProducts.length).toBe(0);
	}, 120_000);

	test("promotes into master Sandbox (the default sandbox)", async () => {
		if (!master || !sub) throw new Error("orgs not provisioned");

		await copyProductForOrgs({
			db,
			logger,
			fromOrg: sub,
			fromEnv: AppEnv.Sandbox,
			toOrg: master,
			toEnv: AppEnv.Sandbox,
			fromProductId: PLAN,
			toId: PLAN,
			toName: "Promoted Plan",
		});

		const masterSandboxProducts = await ProductService.listFull({
			db,
			orgId: master.id,
			env: AppEnv.Sandbox,
		});
		expect(masterSandboxProducts.map((p) => p.id)).toContain(PLAN);
	}, 120_000);

	test("pulls a credit system's metered dependency along on promote", async () => {
		if (!master || !sub) throw new Error("orgs not provisioned");

		await copyProductForOrgs({
			db,
			logger,
			fromOrg: sub,
			fromEnv: AppEnv.Sandbox,
			toOrg: master,
			toEnv: AppEnv.Live,
			fromProductId: CREDIT_PLAN,
			toId: CREDIT_PLAN,
			toName: "Promoted Credit Plan",
		});

		const masterLiveFeatures = await FeatureService.list({
			db,
			orgId: master.id,
			env: AppEnv.Live,
		});
		const ids = masterLiveFeatures.map((f) => f.id);
		// The credit system AND the metered feature its schema references.
		expect(ids).toContain(CREDIT);
		expect(ids).toContain(MSG);
	}, 120_000);

	test("refuses to promote a variant plan across orgs", async () => {
		if (!master || !sub) throw new Error("orgs not provisioned");

		let thrown: unknown;
		try {
			await copyProductForOrgs({
				db,
				logger,
				fromOrg: sub,
				fromEnv: AppEnv.Sandbox,
				toOrg: master,
				toEnv: AppEnv.Live,
				fromProductId: VARIANT_PLAN,
				toId: VARIANT_PLAN,
				toName: "Promoted Variant",
			});
		} catch (error) {
			thrown = error;
		}

		expect(thrown).toBeInstanceOf(RecaseError);
		expect((thrown as RecaseError).code).toBe(ErrCode.InvalidRequest);
		expect((thrown as RecaseError).statusCode).toBe(400);
	}, 120_000);

	test("same-org copy is unchanged (regression): master Sandbox to master Live", async () => {
		if (!master) throw new Error("orgs not provisioned");

		const seedCtx: AutumnContext = {
			...baseCtx,
			org: master,
			env: AppEnv.Sandbox,
			features: [],
		};
		await createFeature({
			ctx: seedCtx,
			data: constructBooleanFeature({
				featureId: `${DASH}_same`,
				orgId: master.id,
				env: AppEnv.Sandbox,
			}),
			skipGenerateDisplay: true,
		});
		const feats = await FeatureService.list({
			db,
			orgId: master.id,
			env: AppEnv.Sandbox,
		});
		await createProduct({
			ctx: { ...seedCtx, features: feats },
			data: products.base({
				id: `${PLAN}_same`,
				items: [
					constructFeatureItem({ featureId: `${DASH}_same`, isBoolean: true }),
				],
			}) as unknown as CreateProductV2Params,
		});

		await copyProductForOrgs({
			db,
			logger,
			fromOrg: master,
			fromEnv: AppEnv.Sandbox,
			toOrg: master,
			toEnv: AppEnv.Live,
			fromProductId: `${PLAN}_same`,
			toId: `${PLAN}_same`,
			toName: "Same Org Copy",
		});

		const masterLive = await ProductService.listFull({
			db,
			orgId: master.id,
			env: AppEnv.Live,
		});
		const copied = masterLive.find((p) => p.id === `${PLAN}_same`);
		expect(copied).toBeDefined();
		const copiedV2 = mapToProductV2({
			product: copied!,
			features: await FeatureService.list({
				db,
				orgId: master.id,
				env: AppEnv.Live,
			}),
		});
		expect(copiedV2.items.map((i) => i.feature_id).filter(Boolean)).toContain(
			`${DASH}_same`,
		);
	}, 120_000);
});
