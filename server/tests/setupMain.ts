import dotenv from "dotenv";

dotenv.config();

import { AppEnv } from "@autumn/shared";
import { clearOrg } from "tests/utils/setupUtils/clearOrg.js";
import { setupOrg } from "tests/utils/setupUtils/setupOrg.js";
import {
	advanceProducts,
	attachProducts,
	cleanFeatures,
	creditSystems,
	entityProducts,
	features,
	oneTimeProducts,
	products,
	referralPrograms,
	rewards,
} from "./global.js";

const ORG_SLUG = process.env.TESTS_ORG!;
const DEFAULT_ENV = AppEnv.Sandbox;

async function main() {
	console.log("🧹 Clearing org...");
	const org = await clearOrg({ orgSlug: ORG_SLUG, env: DEFAULT_ENV });

	console.log("🏗️  Setting up org...");
	await cleanFeatures();
	await setupOrg({
		orgId: org.id,
		env: DEFAULT_ENV,
		features: { ...features, ...creditSystems } as any,
		products: {
			...products,
			...advanceProducts,
			...attachProducts,
			...oneTimeProducts,
			...entityProducts,
		} as any,
		rewards: { ...rewards } as any,
		rewardTriggers: { ...referralPrograms } as any,
	});

	console.log("✅ Setup complete!");
	console.log("--------------------------------");
}

main()
	.catch((error) => {
		console.error("❌ Setup failed:", error);
		process.exit(1);
	})
	.finally(async () => {
		process.exit(0);
	});
