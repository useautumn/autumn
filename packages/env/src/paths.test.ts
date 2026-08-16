import { describe, expect, test } from "bun:test";
import { joinPublicUrl } from "./paths.js";

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
