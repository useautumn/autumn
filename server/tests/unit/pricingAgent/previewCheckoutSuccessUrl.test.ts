import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { buildSuccessUrl } from "@/internal/misc/pricingAgent/handlers/handlePreviewCheckout.js";

const DASHBOARD_ORIGIN = "https://app.useautumn.com";

let previousClientUrl: string | undefined;

beforeAll(() => {
	previousClientUrl = process.env.CLIENT_URL;
	process.env.CLIENT_URL = `${DASHBOARD_ORIGIN}/`;
});

afterAll(() => {
	if (previousClientUrl === undefined) {
		delete process.env.CLIENT_URL;
	} else {
		process.env.CLIENT_URL = previousClientUrl;
	}
});

describe("buildSuccessUrl", () => {
	test("keeps a dashboard-relative path", () => {
		expect(buildSuccessUrl({ successPath: "/onboarding?step=2" })).toBe(
			`${DASHBOARD_ORIGIN}/onboarding?step=2`,
		);
	});

	test("falls back to the dashboard origin when no path is given", () => {
		expect(buildSuccessUrl({})).toBe(DASHBOARD_ORIGIN);
	});

	test("rejects absolute urls pointing elsewhere", () => {
		expect(buildSuccessUrl({ successPath: "https://evil.com/steal" })).toBe(
			DASHBOARD_ORIGIN,
		);
	});

	test("rejects protocol-relative and backslash-escaped paths", () => {
		expect(buildSuccessUrl({ successPath: "//evil.com" })).toBe(
			DASHBOARD_ORIGIN,
		);
		expect(buildSuccessUrl({ successPath: "/\\evil.com" })).toBe(
			DASHBOARD_ORIGIN,
		);
	});
});
