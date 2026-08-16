import { describe, expect, test } from "bun:test";
import { createAutumnEnv } from "./index.js";

const validEnv = {
	AUTUMN_API_URL: "https://api.example.com",
	AUTUMN_PUBLIC_API_URL: "https://public.example.com",
};

describe("Autumn environment", () => {
	test("parses and normalizes both origins", () => {
		const env = createAutumnEnv({
			AUTUMN_API_URL: `${validEnv.AUTUMN_API_URL}/`,
			AUTUMN_PUBLIC_API_URL: `${validEnv.AUTUMN_PUBLIC_API_URL}/`,
		});

		expect(env).toEqual(validEnv);
	});

	test("requires AUTUMN_API_URL", () => {
		expect(() =>
			createAutumnEnv({ ...validEnv, AUTUMN_API_URL: undefined }),
		).toThrow("AUTUMN_API_URL");
		expect(() => createAutumnEnv({ ...validEnv, AUTUMN_API_URL: "" })).toThrow(
			"AUTUMN_API_URL",
		);
	});

	test.each([undefined, ""] as const)(
		"falls back AUTUMN_PUBLIC_API_URL to AUTUMN_API_URL when %s",
		(value) => {
			const env = createAutumnEnv({
				AUTUMN_API_URL: validEnv.AUTUMN_API_URL,
				AUTUMN_PUBLIC_API_URL: value,
			});

			expect(env).toEqual({
				AUTUMN_API_URL: validEnv.AUTUMN_API_URL,
				AUTUMN_PUBLIC_API_URL: validEnv.AUTUMN_API_URL,
			});
		},
	);

	test.each([
		"not-a-url",
		"ftp://api.example.com",
		"https://user:pass@api.example.com",
		"https://api.example.com/v1",
		"https://api.example.com?region=us",
		"https://api.example.com?",
		"https://api.example.com#fragment",
		"https://api.example.com#",
	])("rejects non-origin URL %s", (value) => {
		expect(() =>
			createAutumnEnv({ ...validEnv, AUTUMN_API_URL: value }),
		).toThrow();
	});

	test("does not use a legacy auth URL when AUTUMN_API_URL is missing", () => {
		expect(() =>
			createAutumnEnv({
				BETTER_AUTH_URL: validEnv.AUTUMN_API_URL,
				SERVER_URL: validEnv.AUTUMN_API_URL,
				AUTUMN_PUBLIC_API_URL: validEnv.AUTUMN_PUBLIC_API_URL,
			}),
		).toThrow("AUTUMN_API_URL");
	});

	test("keeps a path prefix on AUTUMN_PUBLIC_API_URL", () => {
		const env = createAutumnEnv({
			AUTUMN_API_URL: validEnv.AUTUMN_API_URL,
			AUTUMN_PUBLIC_API_URL: "https://abc.ngrok.app/backend/",
		});

		expect(env.AUTUMN_PUBLIC_API_URL).toBe("https://abc.ngrok.app/backend");
	});

	test("does not use a legacy webhook URL when AUTUMN_PUBLIC_API_URL is missing", () => {
		const env = createAutumnEnv({
			AUTUMN_API_URL: validEnv.AUTUMN_API_URL,
			STRIPE_WEBHOOK_URL: validEnv.AUTUMN_PUBLIC_API_URL,
			NGROK_URL: validEnv.AUTUMN_PUBLIC_API_URL,
		});

		expect(env).toEqual({
			AUTUMN_API_URL: validEnv.AUTUMN_API_URL,
			AUTUMN_PUBLIC_API_URL: validEnv.AUTUMN_API_URL,
		});
	});
});
