import {
	AppEnv,
	member,
	type OrgConfig,
	organizations,
	user,
} from "@autumn/shared";
import type { DrizzleCli } from "@server/db/initDrizzle.js";
import { createHardcodedKey } from "@server/internal/dev/api-keys/apiKeyUtils.js";
import chalk from "chalk";
import { eq } from "drizzle-orm";

const TEST_ORG_CONFIG = {
	id: "org_2sWv2S8LJ9iaTjLI6UtNsfL88Kt",
	slug: "unit-test-org",
	name: "Unit Test Org",
	createdAt: new Date(1738583937426).toISOString(),
	created_at: 1738583937426,
};

/**
 * Creates a test organization in the database and generates an API key
 */
export async function createTestOrg({
	db,
}: {
	db: DrizzleCli;
}): Promise<string> {
	console.log(
		chalk.magentaBright(
			"\n================ Creating Test Organization ================\n",
		),
	);

	const TEST_API_KEY = process.env.UNIT_TEST_AUTUMN_SECRET_KEY;
	if (!TEST_API_KEY) {
		throw new Error(
			"UNIT_TEST_AUTUMN_SECRET_KEY is not set (is infisical running?)",
		);
	}

	// Check if org already exists
	const existingOrg = await db.query.organizations.findFirst({
		where: eq(organizations.id, TEST_ORG_CONFIG.id),
	});

	if (existingOrg) {
		console.log(
			chalk.yellowBright(
				`Test organization '${TEST_ORG_CONFIG.slug}' already exists.`,
			),
		);

		// Create API key for existing org (will skip if already exists)
		const { key, alreadyExists } = await createHardcodedKey({
			db,
			env: AppEnv.Sandbox,
			name: "Unit Test Key",
			orgId: TEST_ORG_CONFIG.id,
			hardcodedKey: TEST_API_KEY,
			meta: {
				createdBy: "setup-test-script",
				createdAt: new Date().toISOString(),
			},
		});

		if (alreadyExists) {
			console.log(chalk.greenBright("✅ API key already exists in database"));
		} else {
			console.log(
				chalk.greenBright("✅ Created API key for existing organization"),
			);
		}
		return key;
	}

	// Create the test organization
	const org = {
		id: TEST_ORG_CONFIG.id,
		slug: TEST_ORG_CONFIG.slug,
		name: TEST_ORG_CONFIG.name,
		createdAt: new Date(TEST_ORG_CONFIG.created_at),
		created_at: TEST_ORG_CONFIG.created_at,
		stripe_connected: false,
		default_currency: "usd",
		config: {} as OrgConfig,
		onboarded: true,
	};

	await db.insert(organizations).values(org);

	console.log(
		chalk.greenBright(
			`✅ Created test organization: ${TEST_ORG_CONFIG.slug} (${TEST_ORG_CONFIG.id})`,
		),
	);

	// Get first 5 users from database and create memberships
	const users = await db.select().from(user).limit(5);

	if (users.length > 0) {
		const { generateId } = await import("@server/utils/genUtils.js");

		const memberships = users.map((u) => ({
			id: generateId("mem"),
			organizationId: TEST_ORG_CONFIG.id,
			userId: u.id,
			role: "owner",
			createdAt: new Date(),
		}));

		await db.insert(member).values(memberships);

		console.log(
			chalk.greenBright(
				`✅ Created ${memberships.length} membership(s) for test organization`,
			),
		);
	} else {
		console.log(
			chalk.yellowBright(
				"⚠ No users found in database. Skipping membership creation.",
			),
		);
	}

	// Create API key for the new org
	const { key, alreadyExists } = await createHardcodedKey({
		db,
		env: AppEnv.Sandbox,
		name: "Unit Test Key",
		orgId: TEST_ORG_CONFIG.id,
		hardcodedKey: TEST_API_KEY,
		meta: {
			createdBy: "setup-test-script",
			createdAt: new Date().toISOString(),
		},
	});

	if (alreadyExists) {
		console.log(chalk.greenBright("✅ API key already exists in database"));
	} else {
		console.log(chalk.greenBright("✅ Created API key for test organization"));
	}

	return key;
}

export { TEST_ORG_CONFIG };
