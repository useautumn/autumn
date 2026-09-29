/**
 * The dashboard's "Trusted bots" list: PATCH .../settings saves the bots whose
 * @-mentions the Slack agent answers, each running as an org member, and
 * GET /organization/chat reports them back.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import { AppEnv, type ChatTrustedBot, chatInstallations } from "@autumn/shared";
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
	installations: Array<{ reply_mode: string; trusted_bots: ChatTrustedBot[] }>;
};

const slackInstallation = and(
	eq(chatInstallations.org_id, defaultCtx.org.id),
	eq(chatInstallations.provider, "slack"),
);

let session: DashboardSession;

const patchSettings = (body: unknown) =>
	dashboardFetch(defaultCtx, session, "/organization/chat/slack/settings", {
		method: "PATCH",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});

const getTrustedBots = async () => {
	const response = await dashboardGet<ChatStatus>(
		defaultCtx,
		session,
		"/organization/chat",
	);
	expect(response.status).toBe(200);
	return response.data.installations[0]?.trusted_bots;
};

beforeAll(async () => {
	session = await createDashboardSession(defaultCtx);
	await db.delete(chatInstallations).where(slackInstallation);
	await db.insert(chatInstallations).values({
		id: generateId("chat_inst"),
		org_id: defaultCtx.org.id,
		provider: "slack",
		workspace_id: `T_${generateId("test")}`,
		workspace_name: "Trusted bots test",
		bot_user_id: "U_BOT",
		bot_access_token: "unused",
		scopes: [],
		default_env: AppEnv.Sandbox,
	});
});

afterAll(async () => {
	await db.delete(chatInstallations).where(slackInstallation);
	await session.cleanup();
});

test("a new installation trusts no bots", async () => {
	expect(await getTrustedBots()).toEqual([]);
});

test("a trusted bot runs as an org member and remembers who added it", async () => {
	const response = await patchSettings({
		trusted_bots: [
			{ slack_id: "U0C5FGZPE7J", name: "Bill", run_as_user_id: session.userId },
		],
	});
	expect(response.status).toBe(200);

	const [bill] = (await getTrustedBots()) ?? [];
	expect(bill).toMatchObject({
		slack_id: "U0C5FGZPE7J",
		name: "Bill",
		run_as_user_id: session.userId,
		added_by_user_id: session.userId,
	});
	const addedAt = bill?.added_at;
	expect(addedAt).toBeGreaterThan(0);

	// Renaming keeps when it was first added; the reply mode is untouched.
	await patchSettings({
		trusted_bots: [
			{
				slack_id: "U0C5FGZPE7J",
				name: "Bill (deals)",
				run_as_user_id: session.userId,
			},
		],
	});
	const [renamed] = (await getTrustedBots()) ?? [];
	expect(renamed?.name).toBe("Bill (deals)");
	expect(renamed?.added_at).toBe(addedAt);
});

test("a bot cannot run as someone outside the org", async () => {
	const response = await patchSettings({
		trusted_bots: [
			{ slack_id: "B0C4G3PPY85", name: "Rogue", run_as_user_id: "user_nobody" },
		],
	});

	expect(response.status).toBe(400);
	expect((await getTrustedBots())?.map((bot) => bot.name)).toEqual([
		"Bill (deals)",
	]);
});

test("rejects malformed Slack ids and duplicates", async () => {
	const malformed = await patchSettings({
		trusted_bots: [
			{ slack_id: "bill", name: "Bill", run_as_user_id: session.userId },
		],
	});
	expect(malformed.status).toBe(400);

	const bill = {
		slack_id: "U0C5FGZPE7J",
		name: "Bill",
		run_as_user_id: session.userId,
	};
	const duplicated = await patchSettings({ trusted_bots: [bill, bill] });
	expect(duplicated.status).toBe(400);
});

test("removing every bot stops trusting them", async () => {
	expect((await patchSettings({ trusted_bots: [] })).status).toBe(200);
	expect(await getTrustedBots()).toEqual([]);
});
