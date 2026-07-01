// Seed a Slack `chat_installations` row (+ OAuth credentials) into the current
// worktree's DB so the dev Slack app works without a manual OAuth install per
// worktree. Reuses the prod `replaceInstallation()` so the seed matches reality.
//
// Invoked by `bun dw setup` (after the test org is seeded) with DATABASE_URL
// pointed at the worktree branch; also runnable standalone:
//   ENV_FILE=.env infisical run --env=dev --recursive -- \
//     bun apps/leaf/scripts/seedSlackInstall.ts   (DATABASE_URL=<worktree>)
//
// Needs SLACK_BOT_TOKEN (the app's Bot User OAuth Token, xoxb-…) in the env.
// SLACK_CLIENT_ID / SLACK_CLIENT_SECRET configure OAuth, but cannot mint a bot
// token without an install callback code, so this skips cleanly if absent.
import crypto from "node:crypto";
import {
	AppEnv,
	type ChatInstallState,
	DEFAULT_SLACK_BOT_SCOPES,
	member,
	organizations,
} from "@autumn/shared";
import { eq } from "drizzle-orm";
import { db } from "../src/lib/db.js";
import { replaceInstallation } from "../src/providers/slack/installations.js";

// The dev test org seeded by scripts/setupTestUtils/createTestOrg.ts.
const SEED_ORG_SLUG = "unit-test-org";
const SEED_ORG_ID_FALLBACK = "org_2sWv2S8LJ9iaTjLI6UtNsfL88Kt";
const SEED_USER_FALLBACK = "user_setup_test_inviter";

const log = (message: string) => console.log(`[seed-slack] ${message}`);

const main = async () => {
	const botToken = process.env.SLACK_BOT_TOKEN;
	if (!botToken) {
		log(
			"skipping: SLACK_BOT_TOKEN not set (client id/secret are not enough to seed an installed bot)",
		);
		return;
	}

	// Identify the workspace + bot user from the token.
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
		log(`skipping: Slack auth.test failed (${auth.error ?? "unknown"})`);
		return;
	}

	// Resolve the seeded org (by slug, then by known id) — bail if setup-test
	// hasn't run yet.
	const [bySlug] = await db
		.select({ id: organizations.id, slug: organizations.slug })
		.from(organizations)
		.where(eq(organizations.slug, SEED_ORG_SLUG))
		.limit(1);
	let orgId = bySlug?.id;
	if (!orgId) {
		const [byId] = await db
			.select({ id: organizations.id })
			.from(organizations)
			.where(eq(organizations.id, SEED_ORG_ID_FALLBACK))
			.limit(1);
		orgId = byId?.id;
	}
	if (!orgId) {
		log(
			`skipping: org '${SEED_ORG_SLUG}' not found (run the test-org seed first)`,
		);
		return;
	}

	// A member user owns the install/OAuth consent; fall back to the pinned inviter.
	const [memberRow] = await db
		.select({ userId: member.userId })
		.from(member)
		.where(eq(member.organizationId, orgId))
		.limit(1);
	const userId = memberRow?.userId ?? SEED_USER_FALLBACK;

	const state: ChatInstallState = {
		env: AppEnv.Sandbox,
		expiresAt: Date.now() + 600_000,
		nonce: crypto.randomUUID(),
		orgId,
		provider: "slack",
		userId,
	};

	await replaceInstallation({
		botAccessToken: botToken,
		botUserId: auth.user_id,
		provider: "slack",
		scopes: [...DEFAULT_SLACK_BOT_SCOPES],
		state,
		workspaceId: auth.team_id,
		workspaceName: auth.team ?? auth.team_id,
	});

	log(
		`seeded slack installation for org ${bySlug?.slug ?? orgId} (workspace ${auth.team_id})`,
	);
};

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(
			`[seed-slack] failed: ${error instanceof Error ? error.message : String(error)}`,
		);
		process.exit(1);
	});
