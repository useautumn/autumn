import { describe, expect, test } from "bun:test";
import { AppEnv, type ChatInstallation } from "@autumn/shared";

process.env.DATABASE_URL ??=
	"postgresql://postgres:postgres@localhost:5432/postgres";
process.env.ENCRYPTION_PASSWORD ??= "test";
process.env.FIRECRAWL_API_KEY ??= "fc_test";
process.env.SLACK_ADMIN_WORKSPACE_ID = "T_ADMIN";
process.env.SLACK_CLIENT_ID ??= "test";
process.env.SLACK_CLIENT_SECRET ??= "test";
process.env.SLACK_SIGNING_SECRET ??= "test";

const { resolveSlackAdminOrgContext } = await import(
	"../../../src/agent/runMessage/setup/resolveSlackAdminOrg.js"
);

const logger = {
	debug: () => {},
	error: () => {},
	info: () => {},
	warn: () => {},
} as never;

const installation = ({
	id,
	orgId,
	orgSlug,
	provider,
	workspaceId,
}: {
	id: string;
	orgId: string;
	orgSlug?: string;
	provider: ChatInstallation["provider"];
	workspaceId: string;
}) =>
	({
		id,
		org_id: orgId,
		org_slug: orgSlug,
		provider,
		workspace_id: workspaceId,
		workspace_name: workspaceId,
		bot_user_id: "U_BOT",
		bot_access_token: "encrypted",
		scopes: [],
		default_env: AppEnv.Live,
		sandbox_api_key_id: null,
		sandbox_api_key: null,
		live_api_key_id: null,
		live_api_key: null,
		installed_by_user_id: "user_1",
		installed_by_provider_user_id: "U1",
		created_at: 1,
		updated_at: 1,
	}) satisfies ChatInstallation & { org_slug?: string };

const baseDeps = () => ({
	getContextByChannelThread: async () => null,
	getContextByThread: async () => null,
	getInstallationWithOrg: async () => null,
	resolveOrg: async () => null,
	selectOrg: async () => null,
	upsertContext: async () => ({
		chatInstallationId: "unused",
		orgId: "unused",
		orgSlug: undefined,
		source: "installation" as const,
		targetIdentifier: undefined,
	}),
	validateAdminAccess: () => ({ allowed: true as const }),
});

describe("Slack thread context resolution", () => {
	test("non-admin first turn owns thread context", async () => {
		const writes: unknown[] = [];
		const customerInstallation = installation({
			id: "chat_inst_customer",
			orgId: "org_customer",
			orgSlug: "customer",
			provider: "slack",
			workspaceId: "T_CUSTOMER",
		});

		const result = await resolveSlackAdminOrgContext({
			deps: {
				...baseDeps(),
				upsertContext: async (input) => {
					writes.push(input);
					return {
						chatInstallationId: input.chatInstallationId,
						orgId: input.orgId,
						orgSlug: input.orgSlug ?? undefined,
						source: input.source,
						targetIdentifier: input.targetIdentifier ?? undefined,
					};
				},
			},
			installation: customerInstallation,
			logger,
			providerUserId: "U_CUSTOMER",
			recentMessages: [{ author: "Customer", isBot: false, text: "hi" }],
			text: "hi",
			thread: {
				channelId: "C_SHARED",
				threadId: "1700000000.000000",
				workspaceId: "T_CUSTOMER",
			},
		});

		expect(result).toMatchObject({
			admin: false,
			installation: customerInstallation,
			org: { id: "org_customer", slug: "customer" },
		});
		expect(writes).toMatchObject([
			{
				chatInstallationId: "chat_inst_customer",
				orgId: "org_customer",
				source: "installation",
			},
		]);
	});

	test("non-admin follow-up does not rewrite thread context", async () => {
		let writes = 0;
		const customerInstallation = installation({
			id: "chat_inst_customer",
			orgId: "org_customer",
			orgSlug: "customer",
			provider: "slack",
			workspaceId: "T_CUSTOMER",
		});

		const result = await resolveSlackAdminOrgContext({
			deps: {
				...baseDeps(),
				upsertContext: async (input) => {
					writes += 1;
					return {
						chatInstallationId: input.chatInstallationId,
						orgId: input.orgId,
						orgSlug: input.orgSlug ?? undefined,
						source: input.source,
						targetIdentifier: input.targetIdentifier ?? undefined,
					};
				},
			},
			installation: customerInstallation,
			logger,
			providerUserId: "U_CUSTOMER",
			recentMessages: [
				{ author: "Customer", isBot: false, text: "hi" },
				{ author: "Autumn", isBot: true, text: "Hello" },
				{ author: "Customer", isBot: false, text: "following up" },
			],
			text: "following up",
			thread: {
				channelId: "C_SHARED",
				threadId: "1700000000.000000",
				workspaceId: "T_CUSTOMER",
			},
		});

		expect(result).toMatchObject({
			admin: false,
			installation: customerInstallation,
			org: { id: "org_customer", slug: "customer" },
		});
		expect(writes).toBe(0);
	});

	test("admin follow-up uses stored customer context", async () => {
		let selectedOrg = false;
		const customerInstallation = installation({
			id: "chat_inst_customer",
			orgId: "org_customer",
			orgSlug: "customer",
			provider: "slack",
			workspaceId: "T_CUSTOMER",
		});

		const result = await resolveSlackAdminOrgContext({
			deps: {
				...baseDeps(),
				getContextByChannelThread: async () => ({
					chatInstallationId: "chat_inst_customer",
					orgId: "org_customer",
					orgSlug: "customer",
					source: "installation",
					targetIdentifier: undefined,
				}),
				getInstallationWithOrg: async () => customerInstallation,
				selectOrg: async () => {
					selectedOrg = true;
					return null;
				},
			},
			installation: installation({
				id: "chat_inst_admin",
				orgId: "org_autumn",
				orgSlug: "autumn",
				provider: "slack_admin:test",
				workspaceId: "T_ADMIN",
			}),
			logger,
			providerUserId: "U_ADMIN",
			recentMessages: [{ author: "Autumn", isBot: true, text: "Hello" }],
			text: "following up",
			thread: {
				channelId: "C_SHARED",
				threadId: "1700000000.000000",
				workspaceId: "T_ADMIN",
			},
		});

		expect(selectedOrg).toBe(false);
		expect(result).toMatchObject({
			admin: true,
			installation: customerInstallation,
			org: { id: "org_customer", slug: "customer" },
		});
	});

	test("brand-new admin thread stores selected org context", async () => {
		const writes: unknown[] = [];
		const adminInstallation = installation({
			id: "chat_inst_admin",
			orgId: "org_autumn",
			orgSlug: "autumn",
			provider: "slack_admin:test",
			workspaceId: "T_ADMIN",
		});

		const result = await resolveSlackAdminOrgContext({
			deps: {
				...baseDeps(),
				resolveOrg: async ({ identifier }) => ({
					id: "org_target",
					slug: identifier,
				}),
				selectOrg: async () => "target-org",
				upsertContext: async (input) => {
					writes.push(input);
					return {
						chatInstallationId: input.chatInstallationId,
						orgId: input.orgId,
						orgSlug: input.orgSlug ?? undefined,
						source: input.source,
						targetIdentifier: input.targetIdentifier ?? undefined,
					};
				},
			},
			installation: adminInstallation,
			logger,
			providerUserId: "U_ADMIN",
			text: "check target-org",
			thread: {
				channelId: "C_SHARED",
				threadId: "1700000000.000001",
				workspaceId: "T_ADMIN",
			},
		});

		expect(result).toMatchObject({
			admin: true,
			installation: adminInstallation,
			org: { id: "org_target", slug: "target-org" },
		});
		expect(writes).toMatchObject([
			{
				chatInstallationId: "chat_inst_admin",
				orgId: "org_target",
				source: "admin_selection",
				targetIdentifier: "target-org",
			},
		]);
	});
});
