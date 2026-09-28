/**
 * The dashboard's "Reply only when @-mentioned" toggle: GET /organization/chat
 * reports the installation's reply mode and PATCH .../settings changes it.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import { AppEnv, chatInstallations } from "@autumn/shared";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import {
	createDashboardSession,
	type DashboardSession,
	dashboardFetch,
	dashboardGet,
} from "@tests/utils/testInitUtils/dashboardSession.js";
import { and, eq } from "drizzle-orm";
import { initDrizzle } from "@/db/initDrizzle.js";
import { generateId } from "@/utils/genUtils.js";

const { db } = initDrizzle();

type ChatStatus = {
	installations: Array<{ provider: string; reply_mode: string }>;
};

const slackInstallation = and(
	eq(chatInstallations.org_id, defaultCtx.org.id),
	eq(chatInstallations.provider, "slack"),
);

let session: DashboardSession;

const patchReplyMode = (replyMode: string) =>
	dashboardFetch(defaultCtx, session, "/organization/chat/slack/settings", {
		method: "PATCH",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ reply_mode: replyMode }),
	});

beforeAll(async () => {
	session = await createDashboardSession(defaultCtx);
	await db.delete(chatInstallations).where(slackInstallation);
});

afterAll(async () => {
	await db.delete(chatInstallations).where(slackInstallation);
	await session.cleanup();
});

test("changing the reply mode needs a connected Slack installation", async () => {
	const response = await patchReplyMode("mentions_only");

	expect(response.status).toBe(404);
});

test("a Slack installation replies to every message until switched to mentions-only", async () => {
	await db.insert(chatInstallations).values({
		id: generateId("chat_inst"),
		org_id: defaultCtx.org.id,
		provider: "slack",
		workspace_id: `T_${generateId("test")}`,
		workspace_name: "Reply mode test",
		bot_user_id: "U_BOT",
		bot_access_token: "unused",
		scopes: [],
		default_env: AppEnv.Sandbox,
	});

	const before = await dashboardGet<ChatStatus>(
		defaultCtx,
		session,
		"/organization/chat",
	);
	expect(before.status).toBe(200);
	expect(before.data.installations[0]?.reply_mode).toBe("all_messages");

	expect((await patchReplyMode("mentions_only")).status).toBe(200);

	const after = await dashboardGet<ChatStatus>(
		defaultCtx,
		session,
		"/organization/chat",
	);
	expect(after.data.installations[0]?.reply_mode).toBe("mentions_only");

	expect((await patchReplyMode("all_messages")).status).toBe(200);
	const [row] = await db
		.select({ replyMode: chatInstallations.reply_mode })
		.from(chatInstallations)
		.where(slackInstallation);
	expect(row?.replyMode).toBe("all_messages");
});

test("rejects an unknown reply mode", async () => {
	const response = await patchReplyMode("sometimes");

	expect(response.status).toBe(400);
});
