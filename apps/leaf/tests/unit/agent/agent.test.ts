import { afterEach, describe, expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";

process.env.DATABASE_URL ??=
	"postgresql://postgres:postgres@localhost:5432/postgres";
process.env.ENCRYPTION_PASSWORD ??= "test";
process.env.SLACK_CLIENT_ID ??= "test";
process.env.SLACK_CLIENT_SECRET ??= "test";
process.env.SLACK_SIGNING_SECRET ??= "test";

const { leafSystemPrompt, leafSkills } = await import(
	"@autumn/agent-docs/agent"
);
const autumnChatInstructions = leafSystemPrompt("slack");
const { getDefaultChatEnv, selectChatEnv } = await import(
	"../../../src/agent/runMessage/setup/selectChatEnv.js"
);
const { selectChatOrg } = await import(
	"../../../src/agent/runMessage/setup/selectChatOrg.js"
);
const {
	orgIdentifierVariants,
	shouldUseSlackAdminInstallationForWorkspace,
	validateSlackAdminAccessConfig,
} = await import("../../../src/internal/slackAdmin/access.js");
const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
	if (originalNodeEnv === undefined) {
		delete process.env.NODE_ENV;
	} else {
		process.env.NODE_ENV = originalNodeEnv;
	}
});

describe("chat environment selection", () => {
	test("exposes the leaf knowledge skills", () => {
		expect(leafSkills.map((skill) => skill.name).sort()).toEqual([
			"autumn-billing",
			"autumn-catalog",
			"autumn-concepts",
			"autumn-investigate",
		]);
	});

	test("includes the Autumn rules in the agent prompt", () => {
		expect(autumnChatInstructions).toContain(
			"Use Autumn MCP tools for Autumn customer",
		);
		expect(autumnChatInstructions).toContain(
			"load the matching skill BEFORE acting",
		);
	});

	test("uses bullets for multiple required items", () => {
		expect(autumnChatInstructions).toContain(
			"One fact answers in one short sentence",
		);
		expect(autumnChatInstructions).toContain("goes in bullets");
		expect(autumnChatInstructions).toContain("Ask one direct question");
		expect(autumnChatInstructions).toContain(
			"do not expose internal modelling",
		);
	});

	test("points billing actions to the Billing MCP resource", () => {
		expect(autumnChatInstructions).toContain("autumn://docs/billing");
	});

	test("points the dashboard to the catalog knowledge", () => {
		expect(leafSystemPrompt("dashboard")).toContain("autumn-catalog");
	});

	test("defaults to sandbox outside production", () => {
		delete process.env.NODE_ENV;
		expect(getDefaultChatEnv()).toBe(AppEnv.Sandbox);

		process.env.NODE_ENV = "development";
		expect(getDefaultChatEnv()).toBe(AppEnv.Sandbox);
	});

	test("defaults to live in production", () => {
		process.env.NODE_ENV = "production";
		expect(getDefaultChatEnv()).toBe(AppEnv.Live);
	});

	test("uses live from structured model output", async () => {
		await expect(
			selectChatEnv({
				message: "list customers",
				select: () => ({ env: AppEnv.Live }),
			}),
		).resolves.toBe(AppEnv.Live);
	});

	test("uses sandbox from structured model output", async () => {
		await expect(
			selectChatEnv({
				message: "try this in the sandbox first",
				select: () => ({ env: AppEnv.Sandbox }),
			}),
		).resolves.toBe(AppEnv.Sandbox);
	});

	test("rejects malformed model output", async () => {
		await expect(
			selectChatEnv({
				message: "test mode",
				select: () => ({ env: "test" }),
			}),
		).rejects.toThrow();
	});

	test("extracts an explicit org identifier from structured model output", async () => {
		await expect(
			selectChatOrg({
				message: "for org acme-prod, list customers",
				select: () => ({ org_identifier: "acme-prod" }),
			}),
		).resolves.toBe("acme-prod");
	});

	test("allows missing org identifier from structured model output", async () => {
		await expect(
			selectChatOrg({
				message: "list customers",
				select: () => ({ org_identifier: null }),
			}),
		).resolves.toBeNull();
	});

	test("rejects malformed org selector output", async () => {
		await expect(
			selectChatOrg({
				message: "for org acme-prod",
				select: () => ({ org_identifier: 42 }),
			}),
		).rejects.toThrow();
	});
});

describe("Slack admin access gate", () => {
	test("builds flexible org identifier variants", () => {
		expect(
			orgIdentifierVariants({
				identifier: "unit test org",
			}),
		).toContain("unit-test-org");
		expect(
			orgIdentifierVariants({
				identifier: "Unit_Test Org!",
			}),
		).toContain("unit-test-org");
	});

	test("allows the configured admin workspace", () => {
		expect(
			validateSlackAdminAccessConfig({
				configuredWorkspaceId: "T_ADMIN",
				workspaceId: "T_ADMIN",
			}),
		).toEqual({ allowed: true });
	});

	test("fails closed without a workspace config", () => {
		expect(
			validateSlackAdminAccessConfig({
				workspaceId: "T_ADMIN",
			}),
		).toEqual({ allowed: false, reason: "admin_config_missing" });
		expect(
			validateSlackAdminAccessConfig({
				workspaceId: "T_ADMIN",
			}),
		).toEqual({ allowed: false, reason: "admin_config_missing" });
	});

	test("denies the wrong workspace", () => {
		expect(
			validateSlackAdminAccessConfig({
				configuredWorkspaceId: "T_ADMIN",
				workspaceId: "T_OTHER",
			}),
		).toEqual({ allowed: false, reason: "wrong_workspace" });
	});

	test("only checks the admin install for the configured admin workspace", () => {
		expect(
			shouldUseSlackAdminInstallationForWorkspace({
				configuredWorkspaceId: "T_ADMIN",
				isProduction: true,
				workspaceId: "T_ADMIN",
			}),
		).toBe(true);
		expect(
			shouldUseSlackAdminInstallationForWorkspace({
				configuredWorkspaceId: "T_ADMIN",
				isProduction: true,
				workspaceId: "T_CUSTOMER",
			}),
		).toBe(false);
	});

	test("does not check admin installs without workspace config", () => {
		expect(
			shouldUseSlackAdminInstallationForWorkspace({
				isProduction: true,
				workspaceId: "T_ADMIN",
			}),
		).toBe(false);
		expect(
			shouldUseSlackAdminInstallationForWorkspace({
				isProduction: false,
				workspaceId: "T_ADMIN",
			}),
		).toBe(false);
	});
});
