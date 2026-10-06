import { afterEach, describe, expect, test } from "bun:test";
import {
	AGENT_ID_PROVIDER_ID,
	getAgentIdOAuthConfigs,
} from "@/external/agentId/agentIdOAuthConfig.js";

const ENV_KEYS = [
	"AGENTID_CLIENT_ID",
	"AGENTID_CLIENT_SECRET",
	"AGENTID_REDIRECT_URI",
] as const;
const originalEnv = Object.fromEntries(
	ENV_KEYS.map((key) => [key, process.env[key]]),
);

const setEnv = (values: Partial<Record<(typeof ENV_KEYS)[number], string>>) => {
	for (const key of ENV_KEYS) {
		if (values[key] === undefined) delete process.env[key];
		else process.env[key] = values[key];
	}
};

afterEach(() => {
	for (const key of ENV_KEYS) {
		const value = originalEnv[key];
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
});

describe("getAgentIdOAuthConfigs", () => {
	test("is disabled without credentials", () => {
		setEnv({});
		expect(getAgentIdOAuthConfigs()).toEqual([]);
	});

	test("is disabled when the client secret is missing", () => {
		setEnv({ AGENTID_CLIENT_ID: "client_123" });
		expect(getAgentIdOAuthConfigs()).toEqual([]);
	});

	test("is disabled when the client id is missing", () => {
		setEnv({ AGENTID_CLIENT_SECRET: "secret_123" });
		expect(getAgentIdOAuthConfigs()).toEqual([]);
	});

	test("points a confidential PKCE client at AgentID discovery", () => {
		setEnv({
			AGENTID_CLIENT_ID: "client_123",
			AGENTID_CLIENT_SECRET: "secret_123",
		});
		expect(getAgentIdOAuthConfigs()).toEqual([
			{
				providerId: AGENT_ID_PROVIDER_ID,
				discoveryUrl:
					"https://auth.agentid.com/.well-known/openid-configuration",
				clientId: "client_123",
				clientSecret: "secret_123",
				scopes: ["openid", "email", "profile"],
				pkce: true,
				mapProfileToUser: expect.any(Function),
			},
		]);
	});

	test("names an agent from its profile, falling back to its inbox", () => {
		setEnv({
			AGENTID_CLIENT_ID: "client_123",
			AGENTID_CLIENT_SECRET: "secret_123",
		});
		const [config] = getAgentIdOAuthConfigs();
		expect(
			config?.mapProfileToUser?.({ name: "Support Bot", email: "a@x.to" }),
		).toEqual({ name: "Support Bot" });
		expect(
			config?.mapProfileToUser?.({ email: "support@acme.agentmail.to" }),
		).toEqual({ name: "support" });
	});
});
