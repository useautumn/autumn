import { describe, expect, test } from "bun:test";
import type { AutumnLogger } from "@autumn/logging";
import { AppEnv, ChatAuthMode, type ChatInstallation } from "@autumn/shared";
import { resolveSlackCallerAuthCore } from "../../../src/agent/runMessage/setup/resolveSlackCallerAuthCore.js";

const installation = ({ botAccessToken }: { botAccessToken: string }) =>
	({
		id: "chat_inst_1",
		org_id: "org_1",
		provider: "slack",
		workspace_id: "T1",
		workspace_name: "Workspace",
		bot_user_id: "U_BOT",
		bot_access_token: botAccessToken,
		scopes: [],
		auth_mode: ChatAuthMode.PerUser,
		default_env: AppEnv.Sandbox,
		sandbox_api_key_id: null,
		sandbox_api_key: null,
		live_api_key_id: null,
		live_api_key: null,
		installed_by_user_id: "user_installer",
		installed_by_provider_user_id: "U_INSTALLER",
		created_at: 1,
		updated_at: 1,
	}) satisfies ChatInstallation;

describe("resolveSlackCallerAuth", () => {
	test("returns a structured denial when per-user token resolution throws", async () => {
		const errors: unknown[] = [];
		const logger = {
			child: () => logger,
			debug: () => {},
			error: (...args: unknown[]) => {
				errors.push(args);
			},
			info: () => {},
			warn: () => {},
			warning: () => {},
		} as AutumnLogger;

		const result = await resolveSlackCallerAuthCore({
			deps: {
				decrypt: () => {
					throw new Error("corrupt token");
				},
				resolveInstallationAuthMode: () => ChatAuthMode.PerUser,
				resolveSlackUserAuth: async () => {
					throw new Error("should not resolve user auth");
				},
			},
			installation: installation({
				botAccessToken: "not-valid-encrypted-data",
			}),
			logger,
			orgId: "org_1",
			slackUserId: "U1",
		});

		expect(result).toMatchObject({
			usePerUser: true,
			ok: false,
		});
		if (result.usePerUser && !result.ok) {
			expect(result.text).toContain("couldn't verify your Autumn permissions");
		}
		expect(errors).toHaveLength(1);
	});
});
