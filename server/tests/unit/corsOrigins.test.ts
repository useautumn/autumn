import { afterEach, describe, expect, test } from "bun:test";
import { ALLOWED_ORIGINS, isAllowedOrigin } from "@/utils/corsOrigins.js";

describe("isAllowedOrigin", () => {
	const originalNodeEnv = process.env.NODE_ENV;

	afterEach(() => {
		process.env.NODE_ENV = originalNodeEnv;
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
});
