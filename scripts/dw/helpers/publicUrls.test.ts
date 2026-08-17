import { describe, expect, test } from "bun:test";
import {
	entryPublicOrigin,
	laptopDevEnv,
	loopbackServiceUrls,
	publicDevEnv,
} from "./publicUrls.ts";
import { publicServiceUrlsFromDashboard } from "../devProxy/cloudflareConfig.ts";

describe("publicDevEnv", () => {
	test("stamps one public hostname per service", () => {
		const urls = publicServiceUrlsFromDashboard({
			dashboard: "https://autumn-wt45-aa11bb.autumnworktree.com",
		});
		expect(
			publicDevEnv({
				urls,
				worktreeNum: 1,
			}),
		).toEqual({
			AUTUMN_API_URL: "http://localhost:8080",
			AUTUMN_PUBLIC_API_URL:
				"https://autumn-wt45-aa11bb-api.autumnworktree.com",
			CHAT_SERVER_URL: "http://localhost:3099",
			CLIENT_URL: "https://autumn-wt45-aa11bb.autumnworktree.com",
			EMULATE_GOOGLE_FETCH_URL: "http://127.0.0.1:4000",
			EMULATE_GOOGLE_URL:
				"https://autumn-wt45-aa11bb-emulate.autumnworktree.com",
			MCP_SERVER_URL: "https://autumn-wt45-aa11bb-api.autumnworktree.com",
			SLACK_REDIRECT_URI:
				"https://autumn-wt45-aa11bb-api.autumnworktree.com/slack/oauth/callback",
			VITE_API_URL: "https://autumn-wt45-aa11bb-api.autumnworktree.com",
			VITE_BACKEND_URL: "https://autumn-wt45-aa11bb-api.autumnworktree.com",
			VITE_CHECKOUT_URL:
				"https://autumn-wt45-aa11bb-checkout.autumnworktree.com",
			VITE_FRONTEND_URL: "https://autumn-wt45-aa11bb.autumnworktree.com",
		});
	});

	test("laptop keeps auth on portless even when public hosts exist", () => {
		const prev = process.env.DW_HEADLESS;
		delete process.env.DW_HEADLESS;
		try {
			const publicUrls = publicServiceUrlsFromDashboard({
				dashboard: "https://autumn-wt45-aa11bb.autumnworktree.com",
			});
			const env = laptopDevEnv({
				aliases: {
					apiUrl: "https://wt45-api.localhost",
					viteUrl: "https://wt45.localhost",
				},
				publicUrls,
			});
			expect(env.AUTUMN_API_URL).toBe("https://wt45-api.localhost");
			expect(env.AUTUMN_PUBLIC_API_URL).toBe(
				"https://autumn-wt45-aa11bb-api.autumnworktree.com",
			);
			expect(env.CLIENT_URL).toBe("https://wt45.localhost");
			expect(env.VITE_BACKEND_URL).toBe(
				"https://autumn-wt45-aa11bb-api.autumnworktree.com",
			);
			expect(env.EMULATE_GOOGLE_URL).toContain("google.emulate.localhost");
			expect(env.SLACK_REDIRECT_URI).toBe(
				"https://autumn-wt45-aa11bb-api.autumnworktree.com/slack/oauth/callback",
			);
		} finally {
			if (prev === undefined) delete process.env.DW_HEADLESS;
			else process.env.DW_HEADLESS = prev;
		}
	});

	test("entryPublicOrigin prefers publicUrl over leftover ngrokUrl", () => {
		expect(
			entryPublicOrigin({
				ngrokUrl: "https://autumn-wt45.ngrok.app",
				publicUrl: "https://autumn-wt45-aa11bb.autumnworktree.com",
			}),
		).toBe("https://autumn-wt45-aa11bb.autumnworktree.com");
		expect(
			entryPublicOrigin({ ngrokUrl: "https://autumn-wt45.ngrok.app" }),
		).toBe("https://autumn-wt45.ngrok.app");
	});

	test("loopback Cloud fallback is per-service, not a shared origin", () => {
		expect(loopbackServiceUrls({ worktreeNum: 1 })).toEqual({
			api: "http://localhost:8080",
			checkout: "http://localhost:3001",
			emulate: "http://localhost:4000",
			leaf: "http://localhost:3099",
			vite: "http://localhost:3000",
		});
		const env = publicDevEnv({
			urls: loopbackServiceUrls({ worktreeNum: 1 }),
			worktreeNum: 1,
		});
		expect(env.EMULATE_GOOGLE_URL).toBe("http://localhost:4000");
		expect(env.EMULATE_GOOGLE_FETCH_URL).toBe("http://127.0.0.1:4000");
		expect(env.CLIENT_URL).toBe("http://localhost:3000");
		expect(env.VITE_BACKEND_URL).toBe("http://localhost:8080");
	});
});
