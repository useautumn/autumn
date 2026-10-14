import { loadLocalEnv } from "../src/utils/envUtils";

loadLocalEnv();

import { AppEnv } from "@autumn/shared";
import { setupOrg } from "@tests/utils/setup/setupOrg.js";
import { initDrizzle } from "@/db/initDrizzle.js";
import { OrgService } from "@/internal/orgs/OrgService.js";

const ORG_SLUG = process.env.TESTS_ORG!;
const DEFAULT_ENV = AppEnv.Sandbox;

async function main() {
	console.log("🧹 Clearing org...");

	const { db } = initDrizzle();
	const org = await OrgService.getBySlug({ db, slug: ORG_SLUG });

	console.log("🏗️  Setting up org...");
	await setupOrg({
		orgId: org?.id || "",
		env: DEFAULT_ENV,
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
