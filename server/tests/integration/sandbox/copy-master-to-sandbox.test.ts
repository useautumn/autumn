import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
	AppEnv,
	ErrCode,
	type Organization,
	RecaseError,
} from "@autumn/shared";
import {
	ctxForOrgEnv,
	insertCopyTestOrg,
	seedCopyTestBooleanFeature,
	seedCopyTestPlan,
} from "@tests/utils/fixtures/copyEnvFixtures.js";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import { initDrizzle } from "@/db/initDrizzle.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { deletePlatformSubOrg } from "@/internal/orgs/deleteOrg/deletePlatformSubOrg.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { copySandboxForOrg } from "@/internal/sandboxes/copySandbox.js";

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
const VBASE_FEATURE = `m2s_vbase_${suffix}`;
const VBASE_PLAN = `m2s_vbase_plan_${suffix}`;
const VARIANT_FEATURE = `m2s_variant_${suffix}`;
const VARIANT_PLAN = `m2s_variant_plan_${suffix}`;

let master: Organization | undefined;
let sub: Organization | undefined;

const baseCtx = { ...defaultCtx } as AutumnContext;

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
	const seedCtx = ctxForOrgEnv({ org, env });
	await seedCopyTestBooleanFeature({ ctx: seedCtx, featureId });
	await seedCopyTestPlan({
		db,
		ctx: seedCtx,
		planId,
		featureIds: [featureId],
	});
};

beforeAll(async () => {
	master = await insertCopyTestOrg({ db, name: `m2s-master-${suffix}` });
	sub = await insertCopyTestOrg({
		db,
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
}, 180_000);

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
	});

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
	});

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
	});

	test("a selected base brings its variants and their features", async () => {
		if (!master || !sub) throw new Error("orgs not provisioned");

		await seedPlan({
			org: master,
			env: AppEnv.Sandbox,
			featureId: VBASE_FEATURE,
			planId: VBASE_PLAN,
		});
		const base = await ProductService.getFull({
			db,
			idOrInternalId: VBASE_PLAN,
			orgId: master.id,
			env: AppEnv.Sandbox,
		});
		const seedCtx = ctxForOrgEnv({ org: master, env: AppEnv.Sandbox });
		await seedCopyTestBooleanFeature({
			ctx: seedCtx,
			featureId: VARIANT_FEATURE,
		});
		await seedCopyTestPlan({
			db,
			ctx: seedCtx,
			planId: VARIANT_PLAN,
			featureIds: [VARIANT_FEATURE],
			baseInternalProductId: base.internal_id,
		});

		await copySandboxForOrg({
			db,
			ctx: baseCtx,
			masterOrg: master,
			fromOrg: master,
			fromEnv: AppEnv.Sandbox,
			toSandboxId: sub.id,
			productIds: [VBASE_PLAN],
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
		const subBase = subProducts.find((p) => p.id === VBASE_PLAN);
		const subVariant = subProducts.find((p) => p.id === VARIANT_PLAN);

		expect(subBase).toBeDefined();
		expect(subVariant).toBeDefined();
		expect(subVariant?.base_internal_product_id).toBe(
			subBase?.internal_id as string,
		);
		expect(subFeatures.map((f) => f.id)).toContain(VARIANT_FEATURE);
	});

	test("a copy with no source specified is rejected", async () => {
		if (!master || !sub) throw new Error("orgs not provisioned");

		let thrown: unknown;
		try {
			await copySandboxForOrg({
				db,
				ctx: baseCtx,
				masterOrg: master,
				toSandboxId: sub.id,
				productIds: [SBX_PLAN],
			});
		} catch (error) {
			thrown = error;
		}
		expect(thrown).toBeInstanceOf(RecaseError);
		expect((thrown as RecaseError).code).toBe(ErrCode.InvalidRequest);
	});

	test("a requested plan absent from the source is rejected, not a silent no-op", async () => {
		if (!master || !sub) throw new Error("orgs not provisioned");

		let thrown: unknown;
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
		} catch (error) {
			thrown = error;
		}
		expect(thrown).toBeInstanceOf(RecaseError);
		expect((thrown as RecaseError).code).toBe(ErrCode.ProductNotFound);
	});
});
