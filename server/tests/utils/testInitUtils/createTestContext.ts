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
import { OrgService } from "@/internal/orgs/OrgService.js";
import { FeatureService } from "../../../src/internal/features/FeatureService.js";

const ORG_SLUG = process.env.TESTS_ORG!;
const DEFAULT_ENV = AppEnv.Sandbox;

export type TestContext = {
	org: Organization;
	env: AppEnv;
	stripeCli: Stripe;
	db: DrizzleCli;
	features: Feature[];
};

export const createTestContext = async () => {
	const { db } = initDrizzle();

	const org = await OrgService.getBySlug({ db, slug: ORG_SLUG });
	if (!org) throw new Error("Org not found");

	const env = DEFAULT_ENV;
	const stripeCli = createStripeCli({ org, env });
	const features = await FeatureService.list({ db, orgId: org.id, env });

	return {
		org,
		env,
		stripeCli,
		db,
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
