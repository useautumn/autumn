import { describe, expect, test } from "bun:test";
import { browserOpenArgs } from "./open.ts";

describe("browserOpenArgs", () => {
	test("uses open on macOS", () => {
		expect(
			browserOpenArgs({ url: "https://wt3.localhost", platform: "darwin" }),
		).toEqual(["open", "https://wt3.localhost"]);
	});

	test("uses xdg-open on linux", () => {
		expect(
			browserOpenArgs({ url: "http://localhost:3000", platform: "linux" }),
		).toEqual(["xdg-open", "http://localhost:3000"]);
	});
});
