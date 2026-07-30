/**
 * Red test for the OAuth discovery route fallthrough that broke the Devin MCP
 * client (observed 2026-07-30 14:10:08 UTC).
 *
 * The client resolved the issuer from the MCP protected-resource metadata, then
 * ran RFC 9728 protected-resource discovery against that issuer instead of RFC
 * 8414 authorization-server discovery. Those paths match no public OAuth route,
 * so they fall through to the internal router, which session-authenticates
 * every unmatched path.
 *
 * Red-failure mode (current behavior):
 *  - GET /.well-known/oauth-protected-resource/api/auth -> 401 {"code":"no_auth_header"}
 *  - GET /.well-known/oauth-protected-resource          -> 401 {"code":"no_auth_header"}
 *  - both leak {"env":"sandbox"} to unauthenticated callers
 *
 * Green-success criteria (after fix):
 *  - neither path returns a session-authentication error
 *  - neither response body leaks the environment
 *
 * Deliberately does NOT pin whether these paths 404 or serve protected-resource
 * metadata — that is a separate decision. This test only pins that session auth
 * must not apply to public discovery paths, which holds either way.
 */

import { expect, test } from "bun:test";
import chalk from "chalk";

const baseUrl =
	process.env.AUTUMN_TEST_BASE_URL?.replace(/\/$/, "") ??
	`http://localhost:${process.env.SERVER_PORT ?? "8080"}`;

/** The exact paths the Devin client requested, in order, 129ms apart. */
const DEVIN_DISCOVERY_PATHS = [
	"/.well-known/oauth-protected-resource/api/auth",
	"/.well-known/oauth-protected-resource",
] as const;

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

for (const path of DEVIN_DISCOVERY_PATHS) {
	test.concurrent(
		`${chalk.yellowBright(`oauth discovery: ${path} is not session-gated`)}`,
		async () => {
			const { status, body } = await getDiscovery(path);

			expect(body?.code).not.toBe(SESSION_AUTH_ERROR_CODE);
			expect(status).not.toBe(401);
			expect(body?.env).toBeUndefined();
		},
	);
}

/**
 * Positive control: the discovery family the client *should* have used already
 * resolves. Proves a red above is a routing defect, not an unreachable server.
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
