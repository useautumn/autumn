// Seed a `slack_admin:<client id>` installation for the internal Autumn
// workspace so a locally-run bot (bun p/s) gets the admin org+env flow against
// the target DB. Coexists with the deployed bot's row — providers are keyed by
// Slack app client id.
//
//   SLACK_CLIENT_ID=<local app> SLACK_BOT_TOKEN=<local xoxb> \
//   ENV_FILE=.env.prod infisical run --env=prod --recursive -- \
//     bun apps/leaf/scripts/seedSlackAdminInstall.ts
import crypto from "node:crypto";
import {
	AppEnv,
	type ChatInstallState,
	member,
	organizations,
} from "@autumn/shared";
import { DEFAULT_SLACK_BOT_SCOPES } from "@autumn/shared/utils/auth/slackScopes";
import { eq } from "drizzle-orm";
import { db } from "../src/lib/db.js";
import { env } from "../src/lib/env.js";
import { replaceInstallation } from "../src/providers/slack/installations.js";

const ADMIN_ORG_SLUG = process.env.SEED_ADMIN_ORG_SLUG ?? "autumn";

const log = (message: string) => console.log(`[seed-slack-admin] ${message}`);

const required = (key: string) => {
	const value = process.env[key];
	if (!value) throw new Error(`${key} is required`);
	return value;
};

const main = async () => {
	const botToken = required("SLACK_BOT_TOKEN");
	const clientId = required("SLACK_CLIENT_ID");
	const adminWorkspaceId = env.SLACK_ADMIN_WORKSPACE_ID;
	if (!adminWorkspaceId) throw new Error("SLACK_ADMIN_WORKSPACE_ID is not set");

	const response = await fetch("https://slack.com/api/auth.test", {
		headers: { Authorization: `Bearer ${botToken}` },
		method: "POST",
	});
	const auth = (await response.json()) as {
		ok: boolean;
		error?: string;
		team_id?: string;
		team?: string;
		user_id?: string;
	};
	if (!auth.ok || !auth.team_id) {
		throw new Error(`Slack auth.test failed (${auth.error ?? "unknown"})`);
	}
	if (auth.team_id !== adminWorkspaceId) {
		throw new Error(
			`bot workspace ${auth.team_id} is not SLACK_ADMIN_WORKSPACE_ID ${adminWorkspaceId}`,
		);
	}

	const [org] = await db
		.select({ id: organizations.id, slug: organizations.slug })
		.from(organizations)
		.where(eq(organizations.slug, ADMIN_ORG_SLUG))
		.limit(1);
	if (!org) throw new Error(`org '${ADMIN_ORG_SLUG}' not found in target DB`);

	const [memberRow] = await db
		.select({ userId: member.userId })
		.from(member)
		.where(eq(member.organizationId, org.id))
		.limit(1);
	if (!memberRow) throw new Error(`org '${ADMIN_ORG_SLUG}' has no members`);

	const provider = `slack_admin:${clientId}` as const;
	const state: ChatInstallState = {
		env: AppEnv.Sandbox,
		expiresAt: Date.now() + 600_000,
		nonce: crypto.randomUUID(),
		orgId: org.id,
		provider,
		userId: memberRow.userId,
	};
	await replaceInstallation({
		botAccessToken: botToken,
		botUserId: auth.user_id,
		provider,
		scopes: [...DEFAULT_SLACK_BOT_SCOPES],
		state,
		workspaceId: auth.team_id,
		workspaceName: auth.team ?? auth.team_id,
	});
	log(`seeded ${provider} for org ${org.slug} (workspace ${auth.team_id})`);
};

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(
			`[seed-slack-admin] failed: ${error instanceof Error ? error.message : String(error)}`,
		);
		process.exit(1);
	});
