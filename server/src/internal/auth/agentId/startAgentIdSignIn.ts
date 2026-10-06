import { AGENT_ID_PROVIDER_ID } from "@/external/agentId/agentIdOAuthConfig.js";

// Better Auth only starts generic OAuth from a JSON POST; AgentMail opens a plain GET.
export const startAgentIdSignIn = async ({
	request,
	authHandler,
	apiUrl,
	clientUrl,
}: {
	request: Request;
	authHandler: (request: Request) => Promise<Response>;
	apiUrl: string;
	clientUrl: string;
}) => {
	const headers = new Headers(request.headers);
	headers.set("content-type", "application/json");
	headers.set("origin", clientUrl);
	headers.delete("content-length");

	const response = await authHandler(
		new Request(`${apiUrl}/api/auth/sign-in/oauth2`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				providerId: AGENT_ID_PROVIDER_ID,
				callbackURL: `${clientUrl}/`,
				newUserCallbackURL: `${clientUrl}/`,
				errorCallbackURL: `${clientUrl}/sign-in`,
			}),
		}),
	);
	const data = (await response
		.clone()
		.json()
		.catch(() => null)) as { url?: string } | null;
	if (!response.ok || !data?.url) return response;

	const redirect = new Headers({ location: data.url });
	for (const cookie of response.headers.getSetCookie()) {
		redirect.append("set-cookie", cookie);
	}
	return new Response(null, { status: 302, headers: redirect });
};
