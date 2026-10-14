export const parseOAuthTokenResponseBody = async (response: Response) => {
	try {
		return (await response.clone().json()) as Record<string, unknown>;
	} catch {
		return null;
	}
};

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
