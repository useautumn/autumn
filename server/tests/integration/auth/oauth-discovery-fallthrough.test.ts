/**
 * Regression coverage for the OAuth discovery gap that broke the Devin MCP
 * client (observed 2026-07-30 14:10:08 UTC).
 *
 * The client fetched the MCP protected-resource metadata, took the issuer from
 * it, then looked for protected-resource metadata on the API host too. Neither
 * path it tried was registered, so both fell through to the internal router,
 * which session-authenticates every unmatched path.
 *
 * Pre-fix behavior:
 *  - GET /.well-known/oauth-protected-resource          -> 401 {"code":"no_auth_header"}
 *  - GET /.well-known/oauth-protected-resource/api/auth -> 401 {"code":"no_auth_header"}
 *  - both leaked {"env":"sandbox"} to unauthenticated callers
 *
 * Post-fix behavior:
 *  - the bare path serves real metadata: the Autumn API accepts OAuth bearer
 *    tokens, so it is a protected resource and must advertise its issuer
 *  - the /api/auth path describes the authorization server, which is not a
 *    resource, so it 404s rather than returning a session error
 */

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

/**
 * Positive control: the discovery family the client *should* have used still
 * resolves, so a failure above is a routing defect and not an unreachable host.
 */
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
