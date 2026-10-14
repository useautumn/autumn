import { expect, test } from "bun:test";
import chalk from "chalk";

const baseUrl =
	process.env.AUTUMN_TEST_BASE_URL?.replace(/\/$/, "") ??
	`http://localhost:${process.env.SERVER_PORT ?? "8080"}`;

const SESSION_AUTH_ERROR_CODE = "no_auth_header";

const getDiscovery = async (path: string) => {
	const response = await fetch(`${baseUrl}${path}`);
	const text = await response.text();
	let body: Record<string, unknown> | null;
	try {
		body = JSON.parse(text) as Record<string, unknown>;
	} catch {
		body = null;
	}
	return { status: response.status, body, text };
};

test.concurrent(
	`${chalk.yellowBright("oauth discovery: the API advertises its own protected-resource metadata")}`,
	async () => {
		const { status, body } = await getDiscovery(
			"/.well-known/oauth-protected-resource",
		);

		expect(status).toBe(200);
		expect(typeof body?.resource).toBe("string");
		expect(Array.isArray(body?.authorization_servers)).toBe(true);
		expect((body?.authorization_servers as string[])[0]).toMatch(/\/api\/auth$/);
		expect(Array.isArray(body?.scopes_supported)).toBe(true);
	},
);

test.concurrent(
	`${chalk.yellowBright("oauth discovery: an unregistered .well-known path is not session-gated")}`,
	async () => {
		const { status, body } = await getDiscovery(
			"/.well-known/oauth-protected-resource/api/auth",
		);

		expect(body?.code).not.toBe(SESSION_AUTH_ERROR_CODE);
		expect(status).not.toBe(401);
		expect(body?.env).toBeUndefined();
	},
);

test.concurrent(
	`${chalk.yellowBright("oauth discovery: RFC 8414 authorization-server metadata resolves")}`,
	async () => {
		const { status, body } = await getDiscovery(
			"/.well-known/oauth-authorization-server/api/auth",
		);

		expect(status).toBe(200);
		expect(typeof body?.issuer).toBe("string");
		expect(typeof body?.authorization_endpoint).toBe("string");
		expect(typeof body?.token_endpoint).toBe("string");
		expect(typeof body?.registration_endpoint).toBe("string");
	},
);
