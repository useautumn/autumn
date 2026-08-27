import { describe, expect, test } from "bun:test";
import { cloudSeedMissingStripeKey } from "./setup.ts";

describe("cloudSeedMissingStripeKey", () => {
	test("is true when the sandbox key is blank", () => {
		expect(cloudSeedMissingStripeKey({ stripeSandboxSecretKey: undefined })).toBe(
			true,
		);
		expect(cloudSeedMissingStripeKey({ stripeSandboxSecretKey: "  " })).toBe(
			true,
		);
	});

	test("is false when the sandbox key is present", () => {
		expect(
			cloudSeedMissingStripeKey({ stripeSandboxSecretKey: "sk_test_123" }),
		).toBe(false);
	});
});
