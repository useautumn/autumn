/** Null when better-auth answered with a non-JSON body, which callers pass through untouched. */
export const parseOAuthTokenResponseBody = async (response: Response) => {
	try {
		return (await response.clone().json()) as Record<string, unknown>;
	} catch {
		return null;
	}
};

/** Swaps in the token Autumn issues, leaving better-auth's other fields intact. */
export const rewriteOAuthTokenResponseBody = ({
	body,
	scopes,
	token,
}: {
	body: Record<string, unknown>;
	scopes: string[];
	token: string;
}) => ({ ...body, access_token: token, scope: scopes.join(" ") });

/** `response` seeds the headers so better-auth's own headers (cookies, etc.) survive. */
export const jsonOAuthTokenResponse = ({
	body,
	response,
	status,
}: {
	body: unknown;
	response?: Response;
	status: number;
}) => {
	const headers = new Headers(response?.headers);
	headers.set("Content-Type", "application/json");
	headers.set("Cache-Control", "no-store");
	headers.set("Pragma", "no-cache");
	headers.delete("Content-Length");

	return new Response(JSON.stringify(body), { status, headers });
};
