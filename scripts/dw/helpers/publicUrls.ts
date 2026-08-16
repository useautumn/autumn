import { DEV_PROXY_PREFIXES, originServiceUrls } from "../devProxy/routes.ts";
import { emulateGoogleUrl } from "./emulate.ts";
import { EMULATE_PORT, leafPortFor, serverPortFor } from "./ports.ts";

/** Private loopback + public folder URLs for one ngrok origin. */
export function publicDevEnv({
	origin,
	worktreeNum,
}: {
	origin: string;
	worktreeNum: number;
}): Record<string, string> {
	const urls = originServiceUrls({ origin });
	const serverPort = serverPortFor(worktreeNum);
	return {
		AUTUMN_API_URL: `http://localhost:${serverPort}`,
		AUTUMN_PUBLIC_API_URL: urls.api,
		CHAT_SERVER_URL: `http://localhost:${leafPortFor(worktreeNum)}`,
		CLIENT_URL: urls.dashboard,
		// Browser hits the public /emulate path; server token exchange stays on loopback.
		EMULATE_GOOGLE_FETCH_URL: `http://127.0.0.1:${EMULATE_PORT}`,
		EMULATE_GOOGLE_URL: emulateGoogleUrl({ origin }),
		MCP_SERVER_URL: urls.api,
		SLACK_REDIRECT_URI: `${urls.api}/slack/oauth/callback`,
		VITE_API_URL: DEV_PROXY_PREFIXES.api,
		VITE_BACKEND_URL: DEV_PROXY_PREFIXES.api,
		VITE_CHECKOUT_URL: urls.checkout,
		VITE_FRONTEND_URL: urls.dashboard,
	};
}
