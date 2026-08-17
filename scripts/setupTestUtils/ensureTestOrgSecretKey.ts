import { AppEnv, organizations } from "@autumn/shared";
import type { DrizzleCli } from "@server/db/initDrizzle.js";
import { createHardcodedKey } from "@server/internal/dev/apiKeys/apiKeyUtils.js";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { TEST_ORG_CONFIG } from "./createTestOrg.js";

/**
 * Idempotent: ensure UNIT_TEST_AUTUMN_SECRET_KEY's hash exists in this DB's
 * api_keys for the shared unit-test-org. Does not clear products/features.
 */
export async function ensureTestOrgSecretKey({
	db,
}: {
	db: DrizzleCli;
}): Promise<{ key: string; alreadyExists: boolean }> {
	const key = process.env.UNIT_TEST_AUTUMN_SECRET_KEY?.trim();
	if (!key) {
		throw new Error(
			"UNIT_TEST_AUTUMN_SECRET_KEY is required to ensure the test org API key. " +
				"Run via Infisical (bun dw / bun setup:test) or set it explicitly.",
		);
	}

	const org = await db.query.organizations.findFirst({
		where: eq(organizations.id, TEST_ORG_CONFIG.id),
	});
	if (!org) {
		throw new Error(
			`Test org '${TEST_ORG_CONFIG.slug}' (${TEST_ORG_CONFIG.id}) is missing. ` +
				"Run full setup first: bun setup:test --yes",
		);
	}

	const result = await createHardcodedKey({
		db,
		env: AppEnv.Sandbox,
		name: "Unit Test Key",
		orgId: TEST_ORG_CONFIG.id,
		hardcodedKey: key,
		meta: {
			createdBy: "ensure-test-org-secret-key",
			createdAt: new Date().toISOString(),
		},
	});

	console.log(
		chalk.greenBright(
			result.alreadyExists
				? "✅ Test org API key already present in database"
				: "✅ Inserted test org API key into database",
		),
	);

	return result;
}
