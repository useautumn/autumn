import dotenv from "dotenv";
dotenv.config();

import { AppEnv } from "@autumn/shared";
import { initDrizzle } from "@/db/initDrizzle.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { StripeAccountService } from "@/internal/stripe/StripeAccountService.js";

const orgSlug = process.env.TESTS_ORG || "test-debug|org_2sWv2S8LJ9iaTjLI6UtNsfL88Kt";

async function main() {
	const { db, client } = initDrizzle();

	const org = await OrgService.getBySlug({ db, slug: orgSlug });
	console.log("\n=== ORG ===");
	console.log("ID:", org.id);
	console.log("Slug:", org.slug);
	console.log("Name:", org.name);
	console.log("\n=== STRIPE CONFIG ===");
	console.log("test_stripe_connect:", org.test_stripe_connect);
	console.log("live_stripe_connect:", org.live_stripe_connect);

	const features = await FeatureService.list({
		db,
		orgId: org.id,
		env: AppEnv.Sandbox,
	});

	console.log("\n=== FEATURES ===");
	console.log("Total features:", features.length);
	for (const feature of features) {
		console.log(`- ${feature.id} (${feature.type})`, feature.usage_type ? `usage_type: ${feature.usage_type}` : '');
		if (feature.id === 'messages') {
			console.log("\n  Full messages feature:", JSON.stringify(feature, null, 2));
		}
	}

	await client.end();
}

main();
