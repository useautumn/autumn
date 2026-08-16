import { DEV_PROXY_PREFIXES, originServiceUrls } from "../devProxy/routes.ts";
import { leafPortFor, serverPortFor } from "./ports.ts";

/** Env stamps when one ngrok host fronts dashboard / backend / checkout. */
export function pathProxyPublicEnv({
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
		DW_PATH_PROXY: "1",
		MCP_SERVER_URL: urls.api,
		SLACK_REDIRECT_URI: `${urls.api}/slack/oauth/callback`,
		VITE_API_URL: DEV_PROXY_PREFIXES.api,
		VITE_BACKEND_URL: DEV_PROXY_PREFIXES.api,
		VITE_FRONTEND_URL: urls.dashboard,
	};
}
