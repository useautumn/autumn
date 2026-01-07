import { AppEnv } from "@autumn/shared";
import { initDrizzle } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { CusService } from "@/internal/customers/CusService.js";
import { hashApiKey } from "@/internal/dev/api-keys/apiKeyUtils.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { RewardService } from "@/internal/rewards/RewardService.js";
import { CacheManager } from "@/utils/cacheUtils/CacheManager.js";
import { CacheType } from "@/utils/cacheUtils/CacheType.js";

export const clearOrg = async ({
	orgSlug,
	env,
}: {
	orgSlug: string;
	env?: AppEnv;
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
	await CacheManager.disconnect();

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

	// Delete all customers from our database
	await CusService.deleteByOrgId({ db, orgId, env });
	console.log("   ✅ Deleted customers");

	// Delete all products from our database
	await ProductService.deleteByOrgId({ db, orgId, env });
	console.log("   ✅ Deleted products");

	// Delete all rewards from our database
	await RewardService.deleteByOrgId({ db, orgId, env });
	console.log("   ✅ Deleted rewards");

	// Delete all features from our database
	await FeatureService.deleteByOrgId({ db, orgId, env });
	console.log("   ✅ Deleted features");

	console.log(`✅ Cleared org ${orgSlug} (${env})`);

	await client.end();
	return org;
};
