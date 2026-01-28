import "dotenv/config";
import { AppEnv } from "@autumn/shared";
import { initDrizzle } from "@server/db/initDrizzle.js";
import { setupOrg } from "@server/tests/utils/setup/setupOrg.js";
import {
	createTestOrg,
	TEST_ORG_CONFIG,
} from "../setupTestUtils/createTestOrg.js";

const main = async () => {
	console.log("Setting up test organization for CI...");

	const { db } = initDrizzle();
	const apiKey = await createTestOrg({ db });

	// Insert v2 features for the test org
	await setupOrg({
		orgId: TEST_ORG_CONFIG.id,
		env: AppEnv.Sandbox,
	});

	console.log(`Test org created with API key: ${apiKey.substring(0, 20)}...`);
};

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error("Setup failed:", error);
		process.exit(1);
	});
