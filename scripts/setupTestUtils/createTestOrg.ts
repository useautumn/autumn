import { type OrgConfig, member, organizations, user } from "@autumn/shared";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import type { DrizzleCli } from "@server/db/initDrizzle.js";
import { createKey } from "@server/internal/dev/api-keys/apiKeyUtils.js";

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
}): Promise<string | null> {
	console.log(
		chalk.magentaBright(
			"\n================ Creating Test Organization ================\n",
		),
	);

	// Check if org already exists
	const existingOrg = await db.query.organizations.findFirst({
		where: eq(organizations.id, TEST_ORG_CONFIG.id),
	});

	if (existingOrg) {
		console.log(
			chalk.yellowBright(
				`Test organization '${TEST_ORG_CONFIG.slug}' already exists. Creating new API key.`,
			),
		);

		// Always create a new API key for existing org
		const apiKey = await createKey({
			db,
			env: "sandbox" as any,
			name: "Unit Test Key",
			orgId: TEST_ORG_CONFIG.id,
			prefix: "am_sk_test",
			meta: {
				createdBy: "setup-test-script",
				createdAt: new Date().toISOString(),
			},
			userId: undefined,
		});

		console.log(chalk.greenBright("✅ Created API key for existing organization"));
		return apiKey;
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
	const apiKey = await createKey({
		db,
		env: "sandbox" as any,
		name: "Unit Test Key",
		orgId: TEST_ORG_CONFIG.id,
		prefix: "am_sk_test",
		meta: {
			createdBy: "setup-test-script",
			createdAt: new Date().toISOString(),
		},
		userId: undefined,
	});

	console.log(chalk.greenBright("✅ Created API key for test organization"));

	return apiKey;
}

export { TEST_ORG_CONFIG };
