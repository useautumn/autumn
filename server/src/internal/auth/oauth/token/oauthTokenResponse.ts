const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

/** better-auth nests the token payload under `response` on some routes and returns it flat on others. */
export const getOAuthTokenPayload = (body: Record<string, unknown>) =>
	isRecord(body.response) ? body.response : body;

/** Null when better-auth answered with a non-JSON body, which callers pass through untouched. */
export const parseOAuthTokenResponseBody = async (response: Response) => {
	try {
		return (await response.clone().json()) as Record<string, unknown>;
	} catch {
		return null;
	}
};

/** Swaps in the token Autumn issues, keeping whichever shape better-auth returned. */
export const rewriteOAuthTokenResponseBody = ({
	body,
	scopes,
	token,
}: {
	body: Record<string, unknown>;
	scopes: string[];
	token: string;
}) => {
	const issued = { access_token: token, scope: scopes.join(" ") };
	const response = body.response;

	if (isRecord(response)) {
		return { ...body, response: { ...response, ...issued } };
	}

	return { ...body, ...issued };
};

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
