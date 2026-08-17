import { describe, expect, test } from "bun:test";
import { emulateGoogleUrl } from "./emulate.ts";

describe("emulateGoogleUrl", () => {
	test("uses the emulate origin as-is", () => {
		expect(
			emulateGoogleUrl({
				origin: "https://autumn-wt45-aa11bb-emulate.autumnworktree.com",
			}),
		).toBe("https://autumn-wt45-aa11bb-emulate.autumnworktree.com");
		expect(
			emulateGoogleUrl({
				origin: "https://autumn-wt45-aa11bb-emulate.autumnworktree.com/",
			}),
		).toBe("https://autumn-wt45-aa11bb-emulate.autumnworktree.com");
	});

	test("uses loopback emulate on Cloud when that is the service origin", () => {
		expect(emulateGoogleUrl({ origin: "http://localhost:4000" })).toBe(
			"http://localhost:4000",
		);
	});
});
