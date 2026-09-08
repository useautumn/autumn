import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import {
	ensureAtmnAuthorizeScopes,
	isAtmnOAuthClientRecord,
} from "@/internal/auth/oauth/atmnOAuthClients.js";
import { oauthClientRepo } from "@/internal/auth/repos/index.js";

afterEach(() => {
	mock.restore();
});

describe("isAtmnOAuthClientRecord", () => {
	test("does not classify arbitrary metadata values as atmn", () => {
		expect(
			isAtmnOAuthClientRecord({
				clientId: "client_123",
				name: "Third Party App",
				metadata: { description: "connects to atmn projects" },
			}),
		).toBe(false);
	});

	test("classifies explicit atmn metadata and names", () => {
		expect(
			isAtmnOAuthClientRecord({
				clientId: "client_123",
				name: "Third Party App",
				metadata: { kind: "atmn" },
			}),
		).toBe(true);

		expect(
			isAtmnOAuthClientRecord({
				clientId: "client_123",
				name: "atmn",
			}),
		).toBe(true);
	});
});

// Previously, reward scopes were filtered out and Better Auth returned invalid_scope.
test("self-heals only allowed reward scopes requested by atmn", async () => {
	const db = {} as DrizzleCli;
	const clientId = "atmn_client";
	const client = {
		id: "oauth_client",
		clientId,
		name: "atmn",
		redirectUris: ["http://localhost:31448/"],
		scopes: [] as string[],
		metadata: null,
		createdAt: new Date(),
	};
	spyOn(oauthClientRepo, "getByClientId").mockResolvedValue(client);
	const addScopes = spyOn(
		oauthClientRepo,
		"addScopesByClientId",
	).mockResolvedValue(client);

	await ensureAtmnAuthorizeScopes({
		db,
		clientId,
		scope: "rewards:read billing:write rewards:write",
	});

	expect(addScopes).toHaveBeenCalledWith({
		db,
		clientId,
		scopes: ["rewards:read", "rewards:write"],
	});
});

// atmn v3 asks for platform:* so its minted keys can call /v1/sandboxes.*.
test("self-heals the platform scopes the v3 CLI requests for sandboxes", async () => {
	const db = {} as DrizzleCli;
	const clientId = "atmn_client";
	const client = {
		id: "oauth_client",
		clientId,
		name: "atmn",
		redirectUris: ["http://localhost:31448/"],
		scopes: ["organisation:read"],
		metadata: null,
		createdAt: new Date(),
	};
	spyOn(oauthClientRepo, "getByClientId").mockResolvedValue(client);
	const addScopes = spyOn(
		oauthClientRepo,
		"addScopesByClientId",
	).mockResolvedValue(client);

	await ensureAtmnAuthorizeScopes({
		db,
		clientId,
		scope: "organisation:read platform:read platform:write billing:write",
	});

	expect(addScopes).toHaveBeenCalledWith({
		db,
		clientId,
		scopes: ["organisation:read", "platform:read", "platform:write"],
	});
});

// `reset` wipes the sandbox's migration drafts, so its key needs migrations:*.
test("self-heals the migration scopes the v3 CLI requests for reset", async () => {
	const db = {} as DrizzleCli;
	const clientId = "atmn_client";
	const client = {
		id: "oauth_client",
		clientId,
		name: "atmn",
		redirectUris: ["http://localhost:31448/"],
		scopes: ["organisation:read"],
		metadata: null,
		createdAt: new Date(),
	};
	spyOn(oauthClientRepo, "getByClientId").mockResolvedValue(client);
	const addScopes = spyOn(
		oauthClientRepo,
		"addScopesByClientId",
	).mockResolvedValue(client);

	await ensureAtmnAuthorizeScopes({
		db,
		clientId,
		scope: "migrations:read migrations:write billing:write",
	});

	expect(addScopes).toHaveBeenCalledWith({
		db,
		clientId,
		scopes: ["migrations:read", "migrations:write"],
	});
});

// A config's `settings` block writes org config, so its key needs organisation:write.
test("self-heals the organisation:write scope the v3 CLI requests for settings", async () => {
	const db = {} as DrizzleCli;
	const clientId = "atmn_client";
	const client = {
		id: "oauth_client",
		clientId,
		name: "atmn",
		redirectUris: ["http://localhost:31448/"],
		scopes: ["organisation:read"],
		metadata: null,
		createdAt: new Date(),
	};
	spyOn(oauthClientRepo, "getByClientId").mockResolvedValue(client);
	const addScopes = spyOn(
		oauthClientRepo,
		"addScopesByClientId",
	).mockResolvedValue(client);

	await ensureAtmnAuthorizeScopes({
		db,
		clientId,
		scope: "organisation:read organisation:write billing:write",
	});

	expect(addScopes).toHaveBeenCalledWith({
		db,
		clientId,
		scopes: ["organisation:read", "organisation:write"],
	});
});
