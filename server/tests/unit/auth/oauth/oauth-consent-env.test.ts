import { afterEach, describe, expect, test } from "bun:test";
import { SUMMER_OAUTH_CLIENT_ID } from "@autumn/auth/oauth";
import { AppEnv } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { resolveOAuthConsentEnv } from "@/internal/auth/oauth/handleOAuthConsentWithEnv.js";

const originalAtmnClientIds = process.env.ATMN_OAUTH_CLIENT_IDS;

afterEach(() => {
	if (originalAtmnClientIds === undefined) {
		delete process.env.ATMN_OAUTH_CLIENT_IDS;
		return;
	}
	process.env.ATMN_OAUTH_CLIENT_IDS = originalAtmnClientIds;
});

/** The consent handler's only db read is the client behind `client_id`. */
const stubDb = (clientRow: Record<string, unknown> | null) =>
	({
		select: () => ({
			from: () => ({
				where: () => ({
					limit: async () => (clientRow ? [clientRow] : []),
				}),
			}),
		}),
	}) as unknown as DrizzleCli;

const resolveEnv = ({
	clientId = "oauth_client_mcp",
	clientRow = null,
	env,
}: {
	clientId?: string;
	clientRow?: Record<string, unknown> | null;
	env?: unknown;
}) =>
	resolveOAuthConsentEnv({
		clientId,
		db: stubDb(clientRow),
		fields: env === undefined ? {} : { env },
	});

describe("resolveOAuthConsentEnv", () => {
	test("reads the environment the consent submitted", async () => {
		expect(await resolveEnv({ env: AppEnv.Live })).toEqual({
			env: AppEnv.Live,
			envRequired: true,
		});
	});

	test("requires an environment a consent that names none cannot supply", async () => {
		expect(await resolveEnv({})).toEqual({ env: null, envRequired: true });
	});

	test("ignores an environment that is neither live nor sandbox", async () => {
		expect(await resolveEnv({ env: "production" })).toEqual({
			env: null,
			envRequired: true,
		});
	});

	test("defaults the summer client to sandbox", async () => {
		expect(await resolveEnv({ clientId: SUMMER_OAUTH_CLIENT_ID })).toEqual({
			env: AppEnv.Sandbox,
			envRequired: true,
		});
	});

	test("exempts atmn clients, which carry no environment of their own", async () => {
		expect(
			await resolveEnv({
				clientId: "oauth_client_atmn",
				clientRow: { clientId: "oauth_client_atmn", name: "atmn" },
			}),
		).toEqual({ env: null, envRequired: false });
	});

	test("exempts atmn clients configured by id", async () => {
		process.env.ATMN_OAUTH_CLIENT_IDS = "oauth_client_cli";

		expect(await resolveEnv({ clientId: "oauth_client_cli" })).toEqual({
			env: null,
			envRequired: false,
		});
	});
});
