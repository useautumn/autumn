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
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { invalidateProductsCache } from "@/external/redis/actions/productsCache/productsCache.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { createFeature } from "@/internal/features/featureActions/createFeature.js";
import { constructBooleanFeature } from "@/internal/features/utils/constructFeatureUtils.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { createProduct } from "@/internal/product/actions/createProduct.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { generatePublishableKey } from "@/utils/encryptUtils.js";
import { generateId } from "@/utils/genUtils.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";

export const insertCopyTestOrg = async ({
	db,
	name,
	isSandbox = false,
	masterOrgId = null,
}: {
	db: DrizzleCli;
	name: string;
	isSandbox?: boolean;
	masterOrgId?: string | null;
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

export const ctxForOrgEnv = ({
	org,
	env,
}: {
	org: Organization;
	env: AppEnv;
}): AutumnContext =>
	({ ...defaultCtx, org, env, features: [] }) as AutumnContext;

export const seedCopyTestBooleanFeature = async ({
	ctx,
	featureId,
}: {
	ctx: AutumnContext;
	featureId: string;
}) => {
	await createFeature({
		ctx,
		data: constructBooleanFeature({
			featureId,
			orgId: ctx.org.id,
			env: ctx.env,
		}),
		skipGenerateDisplay: true,
	});
};

export const seedCopyTestPlan = async ({
	db,
	ctx,
	planId,
	featureIds = [],
	baseInternalProductId,
}: {
	db: DrizzleCli;
	ctx: AutumnContext;
	planId: string;
	featureIds?: string[];
	baseInternalProductId?: string;
}): Promise<FullProduct> => {
	const { org, env } = ctx;
	const features = await FeatureService.list({ db, orgId: org.id, env });
	await createProduct({
		ctx: { ...ctx, features },
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
