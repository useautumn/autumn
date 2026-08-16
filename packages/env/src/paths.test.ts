import { describe, expect, test } from "bun:test";
import { joinPublicUrl, publicPathBase } from "./paths.js";

describe("joinPublicUrl", () => {
	test("appends to an origin", () => {
		expect(
			joinPublicUrl({
				base: "https://abc.ngrok.app",
				path: "/webhooks/stripe",
			}),
		).toBe("https://abc.ngrok.app/webhooks/stripe");
	});

	test("keeps a /backend prefix", () => {
		expect(
			joinPublicUrl({
				base: "https://abc.ngrok.app/backend",
				path: "/api/auth/oauth2/token",
			}),
		).toBe("https://abc.ngrok.app/backend/api/auth/oauth2/token");
		expect(
			joinPublicUrl({
				base: "https://abc.ngrok.app/backend",
				path: "/mcp",
			}),
		).toBe("https://abc.ngrok.app/backend/mcp");
	});
});

describe("publicPathBase", () => {
	test("uses the public pathname as a Vite base", () => {
		expect(publicPathBase("https://abc.ngrok.app/dashboard")).toBe(
			"/dashboard/",
		);
		expect(publicPathBase("https://abc.ngrok.app/checkout/")).toBe(
			"/checkout/",
		);
	});

	test("root public URLs stay at /", () => {
		expect(publicPathBase("https://app.useautumn.com")).toBe("/");
		expect(publicPathBase("http://localhost:3000")).toBe("/");
		expect(publicPathBase(undefined)).toBe("/");
		expect(publicPathBase("not-a-url")).toBe("/");
	});
});
