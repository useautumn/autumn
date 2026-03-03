import { afterEach, describe, expect, test } from "bun:test";
import { ALLOWED_ORIGINS, isAllowedOrigin } from "@/utils/corsOrigins.js";

const restoreEnvVar = ({
	key,
	value,
}: {
	key: "NODE_ENV" | "CLIENT_URL" | "CHECKOUT_BASE_URL";
	value: string | undefined;
}) => {
	if (value === undefined) {
		delete process.env[key];
		return;
	}

	process.env[key] = value;
};

describe("isAllowedOrigin", () => {
	const originalNodeEnv = process.env.NODE_ENV;
	const originalClientUrl = process.env.CLIENT_URL;
	const originalCheckoutBaseUrl = process.env.CHECKOUT_BASE_URL;

	afterEach(() => {
		restoreEnvVar({ key: "NODE_ENV", value: originalNodeEnv });
		restoreEnvVar({ key: "CLIENT_URL", value: originalClientUrl });
		restoreEnvVar({
			key: "CHECKOUT_BASE_URL",
			value: originalCheckoutBaseUrl,
		});
	});

	describe("production", () => {
		test("allows hardcoded production origins", () => {
			process.env.NODE_ENV = "production";
			for (const origin of ALLOWED_ORIGINS) {
				expect(isAllowedOrigin(origin)).toBe(origin);
			}
		});

		test("rejects arbitrary localhost ports", () => {
			process.env.NODE_ENV = "production";
			expect(isAllowedOrigin("http://localhost:3100")).toBeUndefined();
			expect(isAllowedOrigin("http://localhost:8180")).toBeUndefined();
			expect(isAllowedOrigin("http://localhost:9999")).toBeUndefined();
		});

		test("rejects external origins", () => {
			process.env.NODE_ENV = "production";
			expect(isAllowedOrigin("https://evil.com")).toBeUndefined();
			expect(isAllowedOrigin("https://fake.useautumn.com")).toBeUndefined();
		});
	});

	describe("non-production", () => {
		test("allows hardcoded origins", () => {
			process.env.NODE_ENV = "development";
			for (const origin of ALLOWED_ORIGINS) {
				expect(isAllowedOrigin(origin)).toBe(origin);
			}
		});

		test("allows any localhost port (worktree offsets)", () => {
			process.env.NODE_ENV = "development";
			expect(isAllowedOrigin("http://localhost:3100")).toBe(
				"http://localhost:3100",
			);
			expect(isAllowedOrigin("http://localhost:8180")).toBe(
				"http://localhost:8180",
			);
			expect(isAllowedOrigin("http://localhost:3200")).toBe(
				"http://localhost:3200",
			);
		});

		test("rejects external origins", () => {
			process.env.NODE_ENV = "development";
			expect(isAllowedOrigin("https://evil.com")).toBeUndefined();
			expect(isAllowedOrigin("http://evil.com:3000")).toBeUndefined();
		});

		test("rejects localhost with path or query", () => {
			process.env.NODE_ENV = "development";
			expect(isAllowedOrigin("http://localhost:3000/evil")).toBeUndefined();
			expect(isAllowedOrigin("http://localhost:3000?x=1")).toBeUndefined();
		});
	});

	describe("self-hosted env URLs", () => {
		test("allows CLIENT_URL in production", () => {
			process.env.NODE_ENV = "production";
			process.env.CLIENT_URL =
				"https://autumn-dashboard-production.up.railway.app";
			expect(
				isAllowedOrigin("https://autumn-dashboard-production.up.railway.app"),
			).toBe("https://autumn-dashboard-production.up.railway.app");
		});

		test("allows CLIENT_URL origin when URL has path and trailing slash", () => {
			process.env.NODE_ENV = "production";
			process.env.CLIENT_URL =
				"https://autumn-dashboard-production.up.railway.app/app/";
			expect(
				isAllowedOrigin("https://autumn-dashboard-production.up.railway.app"),
			).toBe("https://autumn-dashboard-production.up.railway.app");
		});

		test("allows CHECKOUT_BASE_URL in production", () => {
			process.env.NODE_ENV = "production";
			process.env.CHECKOUT_BASE_URL =
				"https://autumn-checkout-production.up.railway.app";
			expect(
				isAllowedOrigin("https://autumn-checkout-production.up.railway.app"),
			).toBe("https://autumn-checkout-production.up.railway.app");
		});

		test("trims whitespace around self-hosted env URLs", () => {
			process.env.NODE_ENV = "production";
			process.env.CLIENT_URL = "  https://dashboard.mycompany.com/app/  ";
			expect(isAllowedOrigin("https://dashboard.mycompany.com")).toBe(
				"https://dashboard.mycompany.com",
			);
		});

		test("allows CHECKOUT_BASE_URL origin when URL has path", () => {
			process.env.NODE_ENV = "production";
			process.env.CHECKOUT_BASE_URL =
				"https://autumn-checkout-production.up.railway.app/c";
			expect(
				isAllowedOrigin("https://autumn-checkout-production.up.railway.app"),
			).toBe("https://autumn-checkout-production.up.railway.app");
		});

		test("allows both CLIENT_URL and CHECKOUT_BASE_URL simultaneously", () => {
			process.env.NODE_ENV = "production";
			process.env.CLIENT_URL = "https://dashboard.mycompany.com";
			process.env.CHECKOUT_BASE_URL = "https://checkout.mycompany.com";
			expect(isAllowedOrigin("https://dashboard.mycompany.com")).toBe(
				"https://dashboard.mycompany.com",
			);
			expect(isAllowedOrigin("https://checkout.mycompany.com")).toBe(
				"https://checkout.mycompany.com",
			);
		});

		test("still rejects unrelated origins when env URLs are set", () => {
			process.env.NODE_ENV = "production";
			process.env.CLIENT_URL = "https://dashboard.mycompany.com";
			process.env.CHECKOUT_BASE_URL = "https://checkout.mycompany.com";
			expect(isAllowedOrigin("https://evil.com")).toBeUndefined();
			expect(
				isAllowedOrigin("https://not-autumn.up.railway.app"),
			).toBeUndefined();
		});

		test("ignores invalid self-hosted URL env values", () => {
			process.env.NODE_ENV = "production";
			process.env.CLIENT_URL = "autumn-dashboard-production.up.railway.app";
			process.env.CHECKOUT_BASE_URL = "not-a-url";

			expect(
				isAllowedOrigin("https://autumn-dashboard-production.up.railway.app"),
			).toBeUndefined();
		});

		test("ignores non-http protocols in self-hosted env URLs", () => {
			process.env.NODE_ENV = "production";
			process.env.CLIENT_URL = "ftp://dashboard.mycompany.com";

			expect(
				isAllowedOrigin("https://dashboard.mycompany.com"),
			).toBeUndefined();
		});

		test("rejects custom domains when env URLs are unset", () => {
			process.env.NODE_ENV = "production";
			delete process.env.CLIENT_URL;
			delete process.env.CHECKOUT_BASE_URL;
			expect(
				isAllowedOrigin("https://autumn-dashboard-production.up.railway.app"),
			).toBeUndefined();
		});
	});
});
