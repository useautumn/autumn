import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
	AppEnv,
	type CreateProductV2Params,
	type Organization,
	type OrgConfig,
	organizations,
} from "@autumn/shared";
import { products } from "@tests/utils/fixtures/products.js";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import { initDrizzle } from "@/db/initDrizzle.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { createFeature } from "@/internal/features/featureActions/createFeature.js";
import { constructBooleanFeature } from "@/internal/features/utils/constructFeatureUtils.js";
import { deletePlatformSubOrg } from "@/internal/orgs/deleteOrg/deletePlatformSubOrg.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { createProduct } from "@/internal/product/actions/createProduct.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { copySandboxForOrg } from "@/internal/sandboxes/copySandbox.js";
import { generatePublishableKey } from "@/utils/encryptUtils.js";
import { generateId } from "@/utils/genUtils.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";

// Copying from the master org (default sandbox = master@Sandbox, production =
// master@Live) INTO a named sandbox. Exercises copySandboxForOrg's fromMaster
// source branch (fromOrg + fromEnv instead of a source sandbox), which the
// dashboard "Copy to <sandbox>" menu uses from the default sandbox / production.

const { db } = initDrizzle();
const suffix = crypto.randomUUID().slice(0, 8);

const SBX_FEATURE = `m2s_sbx_${suffix}`;
const SBX_PLAN = `m2s_sbx_plan_${suffix}`;
const LIVE_FEATURE = `m2s_live_${suffix}`;
const LIVE_PLAN = `m2s_live_plan_${suffix}`;

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
	await db.insert(organizations).values({
		id: orgId,
		slug: `${name}-${crypto.randomUUID()}`,
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

const seedPlan = async ({
	org,
	env,
	featureId,
	planId,
}: {
	org: Organization;
	env: AppEnv;
	featureId: string;
	planId: string;
}) => {
	const seedCtx: AutumnContext = { ...baseCtx, org, env, features: [] };
	await createFeature({
		ctx: seedCtx,
		data: constructBooleanFeature({ featureId, orgId: org.id, env }),
		skipGenerateDisplay: true,
	});
	const features = await FeatureService.list({ db, orgId: org.id, env });
	await createProduct({
		ctx: { ...seedCtx, features },
		data: products.base({
			id: planId,
			items: [constructFeatureItem({ featureId, isBoolean: true })],
		}) as unknown as CreateProductV2Params,
	});
};

beforeAll(async () => {
	master = await insertOrg({
		name: `m2s-master-${suffix}`,
		isSandbox: false,
		masterOrgId: null,
	});
	sub = await insertOrg({
		name: `m2s-sub-${suffix}`,
		isSandbox: true,
		masterOrgId: master.id,
	});
	await seedPlan({
		org: master,
		env: AppEnv.Sandbox,
		featureId: SBX_FEATURE,
		planId: SBX_PLAN,
	});
	await seedPlan({
		org: master,
		env: AppEnv.Live,
		featureId: LIVE_FEATURE,
		planId: LIVE_PLAN,
	});
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
});

describe("copy a plan from the master org into a named sandbox", () => {
	test("from the default sandbox (master Sandbox env)", async () => {
		if (!master || !sub) throw new Error("orgs not provisioned");

		await copySandboxForOrg({
			db,
			ctx: baseCtx,
			masterOrg: master,
			fromOrg: master,
			fromEnv: AppEnv.Sandbox,
			toSandboxId: sub.id,
			productIds: [SBX_PLAN],
		});

		const subProducts = await ProductService.listFull({
			db,
			orgId: sub.id,
			env: AppEnv.Sandbox,
		});
		const subFeatures = await FeatureService.list({
			db,
			orgId: sub.id,
			env: AppEnv.Sandbox,
		});
		expect(subProducts.map((p) => p.id)).toContain(SBX_PLAN);
		expect(subFeatures.map((f) => f.id)).toContain(SBX_FEATURE);
	}, 120_000);

	test("from production (master Live env)", async () => {
		if (!master || !sub) throw new Error("orgs not provisioned");

		await copySandboxForOrg({
			db,
			ctx: baseCtx,
			masterOrg: master,
			fromOrg: master,
			fromEnv: AppEnv.Live,
			toSandboxId: sub.id,
			productIds: [LIVE_PLAN],
		});

		const subProducts = await ProductService.listFull({
			db,
			orgId: sub.id,
			env: AppEnv.Sandbox,
		});
		const subFeatures = await FeatureService.list({
			db,
			orgId: sub.id,
			env: AppEnv.Sandbox,
		});
		expect(subProducts.map((p) => p.id)).toContain(LIVE_PLAN);
		expect(subFeatures.map((f) => f.id)).toContain(LIVE_FEATURE);
	}, 120_000);

	test("re-copy overwrites a matching-id plan in the target (upsert, not duplicate)", async () => {
		if (!master || !sub) throw new Error("orgs not provisioned");

		const before = await ProductService.listFull({
			db,
			orgId: sub.id,
			env: AppEnv.Sandbox,
		});
		const countBefore = before.filter((p) => p.id === SBX_PLAN).length;

		await copySandboxForOrg({
			db,
			ctx: baseCtx,
			masterOrg: master,
			fromOrg: master,
			fromEnv: AppEnv.Sandbox,
			toSandboxId: sub.id,
			productIds: [SBX_PLAN],
		});

		const after = await ProductService.listFull({
			db,
			orgId: sub.id,
			env: AppEnv.Sandbox,
		});
		expect(after.filter((p) => p.id === SBX_PLAN).length).toBe(countBefore);
	}, 120_000);

	test("a copy with no source specified is rejected", async () => {
		if (!master || !sub) throw new Error("orgs not provisioned");

		let thrown = false;
		try {
			await copySandboxForOrg({
				db,
				ctx: baseCtx,
				masterOrg: master,
				toSandboxId: sub.id,
				productIds: [SBX_PLAN],
			});
		} catch {
			thrown = true;
		}
		expect(thrown).toBe(true);
	}, 120_000);

	test("a requested plan absent from the source is rejected, not a silent no-op", async () => {
		if (!master || !sub) throw new Error("orgs not provisioned");

		let thrown = false;
		try {
			await copySandboxForOrg({
				db,
				ctx: baseCtx,
				masterOrg: master,
				fromOrg: master,
				fromEnv: AppEnv.Sandbox,
				toSandboxId: sub.id,
				productIds: [`missing_${suffix}`],
			});
		} catch {
			thrown = true;
		}
		expect(thrown).toBe(true);
	}, 120_000);
});
