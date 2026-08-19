import { describe, expect, test } from "bun:test";
import { DEFAULT_OAUTH_RESOURCE_SCOPES } from "@autumn/shared";
import {
	OFFLINE_ACCESS_SCOPE,
	OPENID_SCOPES,
	Scopes,
} from "@autumn/shared/scopeDefinitions";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { registerOAuthClient } from "@/internal/auth/actions/registerOAuthClient.js";

const DEFAULT_MCP_SCOPES = [...DEFAULT_OAUTH_RESOURCE_SCOPES, ...OPENID_SCOPES];

type InsertedClient = Record<string, unknown>;

const createFakeDb = () => {
	const inserted: InsertedClient[] = [];
	const db = {
		insert: () => ({
			values: (values: InsertedClient) => ({
				returning: async () => {
					inserted.push(values);
					return [values];
				},
			}),
		}),
	} as unknown as DrizzleCli;

	return { db, inserted };
};

const register = async ({ body, db }: { body: unknown; db: DrizzleCli }) => {
	const result = await registerOAuthClient({ body, db });
	if (result.status !== 201) {
		throw new Error(`expected a successful registration, got ${result.error}`);
	}
	return result;
};

let registrationCounter = 0;
const uniqueName = () => `Test Client ${Date.now()}-${++registrationCounter}`;

describe("registerOAuthClient", () => {
	test("mints a fresh client id on every registration", async () => {
		const { db, inserted } = createFakeDb();
		const first = await register({
			body: { client_name: uniqueName(), redirect_uris: ["https://a.dev/cb"] },
			db,
		});
		const second = await register({
			body: { client_name: uniqueName(), redirect_uris: ["https://a.dev/cb"] },
			db,
		});

		expect(first.status).toBe(201);
		expect(second.status).toBe(201);
		expect(first.body.client_id).not.toBe(second.body.client_id);
		expect(inserted).toHaveLength(2);
		expect(inserted[0]?.id).not.toBe(inserted[1]?.id);
	});

	test("two clients sharing a redirect uri never collapse onto one client", async () => {
		const { db } = createFakeDb();
		const sharedRedirectUri = "https://mcp.example.com/oauth/callback";
		const cursor = await register({
			body: { client_name: "Cursor", redirect_uris: [sharedRedirectUri] },
			db,
		});
		const attacker = await register({
			body: {
				client_name: "Cursor",
				redirect_uris: [sharedRedirectUri, "https://evil.dev/cb"],
			},
			db,
		});

		expect(attacker.body.client_id).not.toBe(cursor.body.client_id);
		expect(cursor.body.redirect_uris).toEqual([sharedRedirectUri]);
	});

	test("rejects registrations that claim a reserved client name", async () => {
		const { db, inserted } = createFakeDb();

		for (const clientName of [
			"atmn",
			"Autumn CLI",
			"  autumn internal-mcp  ",
			"SUMMER",
		]) {
			const result = await registerOAuthClient({
				body: { client_name: clientName, redirect_uris: ["https://a.dev/cb"] },
				db,
			});
			expect(result).toEqual({
				error: "invalid_client_metadata",
				error_description: "client_name is reserved",
				status: 400,
			});
		}

		expect(inserted).toHaveLength(0);
	});

	test("discards caller-supplied metadata and unknown body keys", async () => {
		const { db, inserted } = createFakeDb();
		await register({
			body: {
				client_name: uniqueName(),
				redirect_uris: ["https://a.dev/cb"],
				metadata: { kind: "atmn", client: "atmn", source: "autumn-cli" },
				client_id: "autumn_admin",
				skipConsent: true,
			},
			db,
		});

		expect(inserted[0]?.metadata).toEqual({ kind: "mcp_client" });
		expect(inserted[0]?.clientId).not.toBe("autumn_admin");
		expect(inserted[0]).not.toHaveProperty("skipConsent");
	});

	test("a metadata-only body claiming atmn is not treated as atmn", async () => {
		const { db, inserted } = createFakeDb();
		const result = await registerOAuthClient({
			body: { metadata: { kind: "atmn" } },
			db,
		});

		expect(result).toEqual({
			error: "invalid_redirect_uri",
			error_description: "redirect_uris is required",
			status: 400,
		});
		expect(inserted).toHaveLength(0);
	});

	test("mints a distinct client for byte-identical repeat registrations", async () => {
		const { db, inserted } = createFakeDb();
		const body = {
			client_name: uniqueName(),
			redirect_uris: ["https://b.dev/cb", "https://a.dev/cb"],
			scope: `${Scopes.Customers.Read} ${Scopes.Plans.Write}`,
		};

		const first = await register({ body, db });
		const repeat = await register({ body, db });

		expect(first.status).toBe(201);
		expect(repeat.status).toBe(201);
		expect(repeat.body.client_id).not.toBe(first.body.client_id);
		expect(inserted).toHaveLength(2);
	});

	test("rejects unsafe and missing redirect uris", async () => {
		const { db, inserted } = createFakeDb();

		expect(
			await registerOAuthClient({
				body: { client_name: uniqueName(), redirect_uris: [] },
				db,
			}),
		).toEqual({
			error: "invalid_redirect_uri",
			error_description: "redirect_uris is required",
			status: 400,
		});

		const unsafeRedirectUri = {
			error: "invalid_redirect_uri",
			error_description: "One or more redirect_uris are not allowed",
			status: 400,
		} as const;

		expect(
			await registerOAuthClient({
				body: {
					client_name: uniqueName(),
					redirect_uris: ["javascript:alert(1)"],
				},
				db,
			}),
		).toEqual(unsafeRedirectUri);

		expect(
			await registerOAuthClient({
				body: {
					client_name: uniqueName(),
					redirect_uris: ["http://evil.example.com/cb"],
				},
				db,
			}),
		).toEqual(unsafeRedirectUri);

		expect(inserted).toHaveLength(0);
	});

	test("answers registered RFC 7591 error codes, never prose", async () => {
		const { db } = createFakeDb();
		const registeredCodes = new Set([
			"invalid_client_metadata",
			"invalid_redirect_uri",
		]);

		for (const body of [
			{},
			{ redirect_uris: "https://a.dev/cb" },
			{ client_name: 5, redirect_uris: ["https://a.dev/cb"] },
			{ client_name: uniqueName(), redirect_uris: ["data:text/html,x"] },
			{ client_name: "atmn", redirect_uris: ["https://a.dev/cb"] },
		]) {
			const result = await registerOAuthClient({ body, db });
			if (result.status === 201) {
				throw new Error("expected a rejected registration");
			}

			expect(registeredCodes.has(result.error)).toBe(true);
			expect(result.error_description.length).toBeGreaterThan(0);
		}
	});

	test("falls back to a generic client name", async () => {
		const { db } = createFakeDb();
		const result = await register({
			body: { redirect_uris: [`https://${Date.now()}.dev/cb`] },
			db,
		});

		expect(result.body.client_name).toBe("MCP client");
	});
});

describe("registerOAuthClient scope grant", () => {
	const registerWithScope = async (scope?: string) => {
		const { db } = createFakeDb();
		const result = await register({
			body: {
				client_name: uniqueName(),
				redirect_uris: ["https://a.dev/cb"],
				...(scope === undefined ? {} : { scope }),
			},
			db,
		});
		return result.body.scope.split(" ");
	};

	test("defaults to the default OAuth scopes plus OIDC scopes", async () => {
		expect(await registerWithScope()).toEqual(DEFAULT_MCP_SCOPES);
		expect(await registerWithScope("   ")).toEqual(DEFAULT_MCP_SCOPES);
	});

	test("keeps explicit OAuth resource scopes and appends OIDC scopes", async () => {
		expect(
			await registerWithScope(
				`${Scopes.Customers.Read} ${Scopes.Plans.Write} ${Scopes.ApiKeys.Write} ${OFFLINE_ACCESS_SCOPE} invalid`,
			),
		).toEqual([
			Scopes.Customers.Read,
			Scopes.Plans.Write,
			Scopes.ApiKeys.Write,
			"openid",
			"profile",
			"email",
			OFFLINE_ACCESS_SCOPE,
		]);
	});

	test("grants default scopes when only OIDC protocol scopes are requested", async () => {
		expect(
			await registerWithScope("openid profile email offline_access"),
		).toEqual([
			...DEFAULT_OAUTH_RESOURCE_SCOPES,
			"openid",
			"profile",
			"email",
			OFFLINE_ACCESS_SCOPE,
		]);
	});
});
