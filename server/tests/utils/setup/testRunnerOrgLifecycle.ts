import { readFile, writeFile } from "node:fs/promises";
import {
	AppEnv,
	apiKeys,
	member,
	type OrgConfig,
	organizations,
	user,
} from "@autumn/shared";
import { eq } from "drizzle-orm";
import { initDrizzle } from "@/db/initDrizzle.js";
import {
	ApiKeyPrefix,
	createKey,
} from "@/internal/dev/api-keys/apiKeyUtils.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { generateId } from "@/utils/genUtils.js";
import { clearOrg } from "./clearOrg.js";
import { setupOrg } from "./setupOrg.js";

type OrgState = {
	orgId: string;
	orgSlug: string;
	secretKey: string;
};

const args = process.argv.slice(2);

const readFlag = (name: string) => {
	const idx = args.findIndex((arg) => arg === name);
	if (idx === -1) return "";
	return args[idx + 1] || "";
};

const command = args[0] || "";
const runId = readFlag("--run-id");
const stateFile = readFlag("--state-file");

if (!stateFile) {
	throw new Error("Missing --state-file");
}

const maskKey = (key: string) => {
	if (key.length <= 10) return `${key.slice(0, 4)}****`;
	return `${key.slice(0, 8)}...${key.slice(-4)}`;
};

const createOrg = async () => {
	if (!runId) {
		throw new Error("Missing --run-id");
	}

	const { db, client } = initDrizzle();
	try {
		const orgId = generateId("org");
		const orgSlug = `test-${runId.slice(3, 11)}-${Date.now().toString(36)}`;

		await db.insert(organizations).values({
			id: orgId,
			slug: orgSlug,
			name: `Test Runner ${runId}`,
			createdAt: new Date(),
			created_at: Date.now(),
			stripe_connected: false,
			default_currency: "usd",
			config: {} as OrgConfig,
			onboarded: true,
		});

		const users = await db.select().from(user).limit(1);
		const firstUser = users[0];
		if (firstUser) {
			await db.insert(member).values({
				id: generateId("mem"),
				organizationId: orgId,
				userId: firstUser.id,
				role: "owner",
				createdAt: new Date(),
			});
		}

		const secretKey = await createKey({
			db,
			env: AppEnv.Sandbox,
			name: "Test Runner Key",
			orgId,
			prefix: ApiKeyPrefix.Sandbox,
			meta: {
				createdBy: "test-runner-daytona",
				runId,
				createdAt: new Date().toISOString(),
			},
		});

		await setupOrg({ orgId, env: AppEnv.Sandbox });

		const state: OrgState = { orgId, orgSlug, secretKey };
		await writeFile(stateFile, JSON.stringify(state), "utf8");
		console.log(
			JSON.stringify({
				orgId: state.orgId,
				orgSlug: state.orgSlug,
				maskedKey: maskKey(state.secretKey),
			}),
		);
	} finally {
		await client.end();
	}
};

const cleanupOrg = async () => {
	const raw = await readFile(stateFile, "utf8");
	const state = JSON.parse(raw) as OrgState;

	process.env.TESTS_ORG = state.orgSlug;
	process.env.UNIT_TEST_AUTUMN_SECRET_KEY = state.secretKey;

	await clearOrg({
		orgSlug: state.orgSlug,
		env: AppEnv.Sandbox,
	});

	const { db, client } = initDrizzle();
	try {
		await db.delete(apiKeys).where(eq(apiKeys.org_id, state.orgId));
		await db.delete(member).where(eq(member.organizationId, state.orgId));
		await OrgService.delete({ db, orgId: state.orgId });
	} finally {
		await client.end();
	}
};

if (command === "create") {
	await createOrg();
	process.exit(0);
}

if (command === "cleanup") {
	await cleanupOrg();
	process.exit(0);
}

throw new Error(
	"Usage: bun testRunnerOrgLifecycle.ts <create|cleanup> --state-file <path> [--run-id <id>]",
);
