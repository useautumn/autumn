import { describe, expect, test } from "bun:test";
import { pathProxyPublicEnv } from "./publicUrls.ts";

describe("pathProxyPublicEnv", () => {
	test("stamps private loopback and public /backend /dashboard", () => {
		expect(
			pathProxyPublicEnv({
				origin: "https://abc.ngrok.app",
				worktreeNum: 1,
			}),
		).toEqual({
			AUTUMN_API_URL: "http://localhost:8080",
			AUTUMN_PUBLIC_API_URL: "https://abc.ngrok.app/backend",
			CHAT_SERVER_URL: "http://localhost:3099",
			CLIENT_URL: "https://abc.ngrok.app/dashboard",
			DW_PATH_PROXY: "1",
			EMULATE_GOOGLE_FETCH_URL: "http://127.0.0.1:4000",
			EMULATE_GOOGLE_URL: "https://abc.ngrok.app/emulate",
			MCP_SERVER_URL: "https://abc.ngrok.app/backend",
			SLACK_REDIRECT_URI: "https://abc.ngrok.app/backend/slack/oauth/callback",
			VITE_API_URL: "/backend",
			VITE_BACKEND_URL: "/backend",
			VITE_FRONTEND_URL: "https://abc.ngrok.app/dashboard",
		});
	});
});
