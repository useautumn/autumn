import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Try loading .env from current directory, then parent directory
// dotenv.config({ path: resolve(__dirname, ".env") });
dotenv.config({ path: resolve(__dirname, "..", "..", "..", ".env") });

import { AppEnv, type Feature, type Organization } from "@autumn/shared";
import type Stripe from "stripe";
import { type DrizzleCli, initDrizzle } from "@/db/initDrizzle.js";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";

const DEFAULT_ENV = AppEnv.Sandbox;

export type TestContext = {
	org: Organization;
	env: AppEnv;
	stripeCli: Stripe;
	db: DrizzleCli;
	orgSecretKey: string;
	features: Feature[];
};

export const createTestContext = async () => {
	const { db } = initDrizzle();

	// Support dynamic org slug from environment (for parallel test groups)
	// Falls back to TESTS_ORG for legacy tests
	const orgSlug = process.env.TESTS_ORG;
	if (!orgSlug) {
		throw new Error(
			"TESTS_ORG environment variable is required (set by test runner)",
		);
	}

	const org = await OrgService.getBySlug({ db, slug: orgSlug });
	if (!org) {
		throw new Error(`Org with slug "${orgSlug}" not found`);
	}

	const env = DEFAULT_ENV;
	const stripeCli = createStripeCli({ org, env });

	// Get org secret key for API calls
	// Priority: 1. Environment variable (set by test runner), 2. Org's secret_keys field
	const orgSecretKey =
		process.env.UNIT_TEST_AUTUMN_SECRET_KEY || org.secret_keys?.[env] || "";
	if (!orgSecretKey) {
		throw new Error(
			`No secret key found for org "${orgSlug}" in environment "${env}". ` +
				`Make sure UNIT_TEST_AUTUMN_SECRET_KEY is set or org has secret_keys.${env}`,
		);
	}

	// Fetch and cache features for this org
	const features = await FeatureService.list({
		db,
		orgId: org.id,
		env,
	});

	return {
		org,
		env,
		stripeCli,
		db,
		orgSecretKey,
		features,
	};
};

// Only create test context if we're actually running tests
const isTestEnvironment =
	process.env.NODE_ENV === "test" ||
	process.argv.some((arg) => arg.includes("test")) ||
	process.argv[1]?.includes("/tests/");

let testContext: TestContext | null = null;

if (isTestEnvironment) {
	testContext = await createTestContext();
}

export default testContext as TestContext;
