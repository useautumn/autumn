/**
 * Error carrying the HTTP status and OAuth metadata the MCP HTTP layer needs to
 * build a spec-compliant `WWW-Authenticate` response. Lives in its own module so
 * both the request helpers and the OAuth flow can throw it without import cycles.
 */
export class OAuthHttpError extends Error {
	constructor(
		readonly status: number,
		message: string,
		readonly error = "invalid_token",
		readonly wwwAuthenticate?: string,
	) {
		super(message);
	}
}
