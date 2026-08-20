import type { Context } from "hono";

/**
 * Codex CLI 0.146.0 drops `iss` from the auth callback, and advertising RFC 9207
 * support makes its OAuth library reject the iss-less (valid) callback.
 *
 * Every discovery document this server serves has to agree on the flag, so both
 * the RFC 8414 and the OpenID Connect routes answer through here.
 */
export const respondWithoutIssParameterSupport = async ({
	c,
	getMetadata,
}: {
	c: Context;
	getMetadata: (request: Request) => Response | Promise<Response>;
}) => {
	const response = await getMetadata(c.req.raw);
	const metadata = (await response.json()) as Record<string, unknown>;

	// The patched body is a different byte length from the one upstream framed,
	// so a copied Content-Length would truncate the response mid-document.
	const headers = new Headers(response.headers);
	headers.delete("Content-Length");

	return new Response(
		JSON.stringify({
			...metadata,
			authorization_response_iss_parameter_supported: false,
		}),
		{ status: response.status, headers },
	);
};
