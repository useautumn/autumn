import { describe, expect, test } from "bun:test";
import { emulateGoogleUrl } from "./emulate.ts";

describe("emulateGoogleUrl", () => {
	test("uses /emulate on the shared public origin", () => {
		expect(emulateGoogleUrl({ origin: "https://abc.ngrok.app" })).toBe(
			"https://abc.ngrok.app/emulate",
		);
		expect(emulateGoogleUrl({ origin: "https://abc.ngrok.app/" })).toBe(
			"https://abc.ngrok.app/emulate",
		);
	});
});
