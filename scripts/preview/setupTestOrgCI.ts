import "dotenv/config";
import { AppEnv } from "@autumn/shared";
import { initDrizzle } from "@server/db/initDrizzle.js";
import { setupOrg } from "@server/tests/utils/setup/setupOrg.js";
import { createTestOrgForPR } from "../setupTestUtils/createTestOrg.js";

const main = async () => {
	const prNumber = process.env.PR_NUMBER;
	if (!prNumber) {
		throw new Error("PR_NUMBER environment variable is required");
	}

	console.log(`Setting up test organization for PR #${prNumber}...`);

	const { db } = initDrizzle();
	const { apiKey, orgId } = await createTestOrgForPR({ db, prNumber });

	// Insert v2 features for the test org
	await setupOrg({
		orgId,
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
