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
