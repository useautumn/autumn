import { describe, expect, test } from "bun:test";
import { createAutumnClient } from "../../../src/external/autumn/createAutumnClient";

describe("createAutumnClient", () => {
	test("refuses a live key unless explicitly allowed", () => {
		expect(() =>
			createAutumnClient({ config: { secretKey: "am_sk_live_abc" } }),
		).toThrow(/sandbox/);
		expect(() =>
			createAutumnClient({ config: { secretKey: "am_sk_test_abc" } }),
		).not.toThrow();
		expect(() =>
			createAutumnClient({
				config: { secretKey: "am_sk_live_abc", allowLiveKey: true },
			}),
		).not.toThrow();
	});
});
