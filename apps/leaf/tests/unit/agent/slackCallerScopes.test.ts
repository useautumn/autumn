import { beforeEach, describe, expect, test } from "bun:test";
import type { AutumnLogger } from "@autumn/logging";
import {
	AppEnv,
	type ChatInstallation,
	chatOAuthCredentials,
	oauthConsent,
} from "@autumn/shared";
import { ChatAuthMode } from "@autumn/shared/models/chatModels/chatEnums";
import { encrypt } from "../../../src/lib/crypto.js";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

type DirectoryEntry = { email: string; userId: string; role: string };

/** Slack sender → Autumn identity; a sender missing here has no Autumn user. */
const directory: Record<string, DirectoryEntry | undefined> = {
	U_ADMIN: { email: "admin@example.com", role: "admin", userId: "user_admin" },
	U_MEMBER: {
		email: "member@example.com",
		role: "member",
		userId: "user_member",
	},
	U_UNKNOWN: undefined,
};

let lookedUp: DirectoryEntry | undefined;
const mintedCredentials: { userId: string; userScopes: string[] }[] = [];

await mockModuleWithRestore({
	baseUrl: import.meta.url,
	specifier: "../../../src/providers/slack/users.js",
	factory: () => ({
		fetchSlackUserEmailCached: async ({
			slackUserId,
		}: {
			slackUserId: string;
		}) => {
			lookedUp = directory[slackUserId];
			return lookedUp?.email ?? "stranger@example.com";
		},
	}),
});
await mockModuleWithRestore({
	baseUrl: import.meta.url,
	specifier: "../../../src/lib/db.js",
	factory: () => ({
		db: {
			query: {
				member: {
					findFirst: async () =>
						lookedUp ? { role: lookedUp.role } : undefined,
				},
				user: {
					findMany: async () => (lookedUp ? [{ id: lookedUp.userId }] : []),
				},
			},
		},
	}),
});
await mockModuleWithRestore({
	baseUrl: import.meta.url,
	specifier:
		"../../../src/internal/installations/actions/ensureChatUserCredential.js",
	factory: () => ({
		ensureChatUserCredential: async (params: {
			userId: string;
			userScopes: string[];
		}) => {
			mintedCredentials.push({
				userId: params.userId,
				userScopes: params.userScopes,
			});
		},
	}),
});

const { resolveSlackCallerAuth } = await import(
	"../../../src/providers/slack/setup/resolveSlackCallerAuth.js"
);
const { replaceInstallationOAuthCredentials } = await import(
	"../../../src/internal/installations/actions/replaceInstallationOAuthCredentials.js"
);

const unrestrictedInstallation = {
	id: "chat_inst_1",
	org_id: "org_1",
	provider: "slack",
	workspace_id: "T1",
	workspace_name: "Workspace",
	bot_user_id: "U_BOT",
	bot_access_token: encrypt("xoxb-test"),
	scopes: [],
	auth_mode: ChatAuthMode.Unrestricted,
	reply_mode: "all_messages",
	trusted_bots: [],
	default_env: AppEnv.Sandbox,
	sandbox_api_key_id: null,
	sandbox_api_key: null,
	live_api_key_id: null,
	live_api_key: null,
	installed_by_user_id: "user_installer",
	installed_by_provider_user_id: "U_INSTALLER",
	created_at: 1,
	updated_at: 1,
} satisfies ChatInstallation;

const noopLogger = {
	child: () => noopLogger,
	debug: () => {},
	error: () => {},
	info: () => {},
	warn: () => {},
	warning: () => {},
} as AutumnLogger;

const resolveSender = (slackUserId: string) =>
	resolveSlackCallerAuth({
		installation: unrestrictedInstallation,
		logger: noopLogger,
		orgId: "org_1",
		slackUserId,
	});

beforeEach(() => {
	lookedUp = undefined;
	mintedCredentials.length = 0;
});

describe("per-sender scopes on an unrestricted Slack install", () => {
	test("an admin sender gets their admin role's scopes", async () => {
		const auth = await resolveSender("U_ADMIN");

		expect(auth).toMatchObject({
			ok: true,
			role: "admin",
			usePerUser: true,
			userId: "user_admin",
		});
		expect(mintedCredentials).toEqual([
			{
				userId: "user_admin",
				userScopes: expect.arrayContaining(["billing:write"]),
			},
		]);
	});

	test("a member sender is narrowed to read scopes, not the installer's admin", async () => {
		const auth = await resolveSender("U_MEMBER");

		expect(auth).toMatchObject({
			ok: true,
			role: "member",
			usePerUser: true,
			userId: "user_member",
		});
		const [minted] = mintedCredentials;
		expect(minted?.userId).toBe("user_member");
		expect(minted?.userScopes).toContain("billing:read");
		expect(minted?.userScopes).not.toContain("billing:write");
		expect(minted?.userScopes).not.toContain("customers:write");
	});

	test("an unknown sender is denied rather than falling back to admin", async () => {
		const auth = await resolveSender("U_UNKNOWN");

		expect(auth).toMatchObject({ ok: false, usePerUser: true });
		expect(mintedCredentials).toEqual([]);
	});
});

type InsertedRow = { table: unknown; values: Record<string, unknown> };

const recordingTransaction = () => {
	const inserted: InsertedRow[] = [];
	const tx = {
		insert: (table: unknown) => ({
			values: (values: Record<string, unknown>) => {
				inserted.push({ table, values });
				return Object.assign(Promise.resolve(), {
					onConflictDoUpdate: async () => {},
				});
			},
		}),
		select: () => ({
			from: () => ({ where: () => ({ limit: async () => [] }) }),
		}),
		update: () => ({ set: () => ({ where: async () => {} }) }),
	};
	return { inserted, tx };
};

const mintOnUnrestrictedInstall = async (agentScopes?: string[]) => {
	const { inserted, tx } = recordingTransaction();
	await replaceInstallationOAuthCredentials({
		agentScopes,
		installation: unrestrictedInstallation,
		tx: tx as unknown as Parameters<
			typeof replaceInstallationOAuthCredentials
		>[0]["tx"],
		userId: "user_member",
	});
	return {
		consents: inserted.filter((row) => row.table === oauthConsent),
		credentials: inserted.filter((row) => row.table === chatOAuthCredentials),
	};
};

describe("credential minting on an unrestricted install", () => {
	test("a sender's role scopes are minted, not the scope-less admin grant", async () => {
		const { consents, credentials } = await mintOnUnrestrictedInstall([
			"billing:read",
			"customers:read",
		]);

		expect(credentials).toHaveLength(2);
		for (const { values } of credentials) {
			expect(values.scopes).toEqual(["billing:read", "customers:read"]);
		}
		for (const { values } of consents) {
			expect(values.metadata).toEqual({});
		}
	});

	test("the installer credential without requested scopes stays unrestricted", async () => {
		const { credentials } = await mintOnUnrestrictedInstall();

		for (const { values } of credentials) {
			expect(values.scopes).toEqual([]);
		}
	});
});
