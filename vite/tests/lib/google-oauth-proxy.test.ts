import { describe, expect, test } from "bun:test";
import { googleOAuthUrlForBrowser } from "@/lib/googleOAuthProxy";

describe("googleOAuthUrlForBrowser", () => {
	test("routes the emulator authorization request through the browser origin", () => {
		expect(
			googleOAuthUrlForBrowser({
				providerUrl:
					"http://localhost:4000/o/oauth2/v2/auth?client_id=capy&state=test",
				browserOrigin: "https://machine.capysandbox.net",
			}),
		).toBe(
			"https://machine.capysandbox.net/o/oauth2/v2/auth?client_id=capy&state=test",
		);
	});
});
