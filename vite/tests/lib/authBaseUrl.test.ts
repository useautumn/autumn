import { describe, expect, test } from "bun:test";
import { resolveAuthBaseUrl } from "@/lib/authBaseUrl";

describe("resolveAuthBaseUrl", () => {
	test("appends /api/auth to an absolute backend", () => {
		expect(
			resolveAuthBaseUrl({ backendUrl: "http://localhost:8080" }),
		).toBe("http://localhost:8080/api/auth");
	});

	test("resolves /backend against the page origin", () => {
		expect(
			resolveAuthBaseUrl({
				backendUrl: "/backend",
				origin: "https://abc.ngrok.app",
			}),
		).toBe("https://abc.ngrok.app/backend/api/auth");
	});
});
