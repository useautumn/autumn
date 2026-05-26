import {
	AppEnv,
	customerProducts,
	migrationItemRuns,
	migrations,
	products,
} from "@autumn/shared";
import { and, eq, inArray } from "drizzle-orm";
import { initDrizzle } from "@/db/initDrizzle.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { CusService } from "@/internal/customers/CusService.js";
import { hashApiKey } from "@/internal/dev/api-keys/apiKeyUtils.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { rewardRepo } from "@/internal/rewards/repos/index.js";
import { CacheManager } from "@/utils/cacheUtils/CacheManager.js";
import { CacheType } from "@/utils/cacheUtils/CacheType.js";

/**
 * DB-only org cleanup — no HTTP calls, no connection lifecycle.
 * Safe to call from setup scripts that already hold a db handle.
 */
export const clearOrgDbOnly = async ({
	db,
	orgId,
	env,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
}) => {
	await CusService.deleteByOrgId({ db, orgId, env });

	// customer_products_internal_product_id_fkey has no ON DELETE CASCADE.
	// Explicitly wipe any remaining rows so the subsequent product delete succeeds.
	const orgProductIds = db
		.select({ internal_id: products.internal_id })
		.from(products)
		.where(and(eq(products.org_id, orgId), eq(products.env, env)));

	await db
		.delete(customerProducts)
		.where(inArray(customerProducts.internal_product_id, orgProductIds));

	await ProductService.deleteByOrgId({ db, orgId, env });
	await rewardRepo.deleteByOrgId({ db, orgId, env });
	await FeatureService.deleteByOrgId({ db, orgId, env });
};

export const clearOrg = async ({
	orgSlug,
	env,
	skipStripeReset,
}: {
	orgSlug: string;
	env: AppEnv;
	skipStripeReset?: boolean;
}) => {
	if (env !== AppEnv.Sandbox) {
		console.error("Cannot clear non-sandbox orgs");
		process.exit(1);
	}

	const autumn = new AutumnInt();

	const { db, client } = initDrizzle();
	const org = await OrgService.getBySlug({ db, slug: orgSlug });

	await Promise.all([
		CacheManager.invalidate({
			action: CacheType.SecretKey,
			value: hashApiKey(process.env.UNIT_TEST_AUTUMN_SECRET_KEY!),
		}),
		CacheManager.invalidate({
			action: CacheType.PublicKey,
			value: process.env.UNIT_TEST_AUTUMN_PUBLIC_KEY!,
		}),
	]);
	// await CacheManager.disconnect();

	if (!org) {
		throw new Error(`Org ${orgSlug} not found`);
	}

	// Allow unit-test-org, ci_cd, and platform test orgs (test-*|org_...)
	const isAllowed =
		org.slug === "unit-test-org" ||
		org.slug === "ci_cd" ||
		org.slug.startsWith("test-");

	if (!isAllowed) {
		console.error("Cannot clear non-unit-test-orgs");
		process.exit(1);
	}

	const orgId = org.id;

	if (!skipStripeReset) {
		// Reset default account using the new internal endpoint
		// This will delete and recreate the Stripe account, which automatically removes all Stripe resources
		console.log("   🔄 Resetting default account...");
		try {
			const data = await autumn.organization.resetDefaultAccount();
			console.log(
				"   ✅ Reset default account, new account:",
				data?.new_account_id,
			);
		} catch (error: any) {
			console.error("   ❌ Failed to reset default account:", error.message);
			// Continue anyway as this is not critical
		}
	}

	await clearOrgDbOnly({ db, orgId, env });
	console.log("   ✅ Deleted customers, products, rewards, and features");

	// migration_item_runs has no FK to migrations/org; clear by joining first.
	// migrations cascades to migration_runs, so deleting it is enough.
	const orgMigrations = await db
		.select({ internalId: migrations.internal_id })
		.from(migrations)
		.where(and(eq(migrations.org_id, orgId), eq(migrations.env, env)));
	if (orgMigrations.length > 0) {
		await db.delete(migrationItemRuns).where(
			inArray(
				migrationItemRuns.migration_internal_id,
				orgMigrations.map((m) => m.internalId),
			),
		);
	}
	await db
		.delete(migrations)
		.where(and(eq(migrations.org_id, orgId), eq(migrations.env, env)));
	console.log("   ✅ Deleted migrations + migration item runs");

	console.log(`✅ Cleared org ${orgSlug} (${env})`);

	await client.end();
	return org;
};
