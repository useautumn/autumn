import { describe, expect, test } from "bun:test";
import { createFxClient } from "../../src/createFxClient";
import { FxProviderError, getUsdRateTable } from "../../src/getUsdRateTable";

const APP_ID = "secret-app-id";
/** 2026-09-26T23:59:59Z, what the provider stamps on that day's closing rates. */
const CLOSE_OF_2026_09_26 = 1790467199;

const clientReturning = ({
	status,
	body,
	requests,
}: {
	status: number;
	body: unknown;
	requests: URL[];
}) =>
	createFxClient({
		config: {
			appId: APP_ID,
			baseUrl: "https://rates.test/api",
			fetch: (async (input: URL | Request | string) => {
				requests.push(new URL(String(input)));
				return new Response(JSON.stringify(body), { status });
			}) as typeof fetch,
		},
	});

describe("getUsdRateTable", () => {
	test("asks for the day's USD-base table and returns it", async () => {
		const requests: URL[] = [];
		const fx = clientReturning({
			status: 200,
			body: {
				base: "USD",
				timestamp: CLOSE_OF_2026_09_26,
				rates: { EUR: 0.92, JPY: 150 },
			},
			requests,
		});

		const table = await getUsdRateTable({ ctx: { fx }, date: "2026-09-26" });

		expect(requests).toHaveLength(1);
		expect(requests[0].pathname).toBe("/api/historical/2026-09-26.json");
		expect(requests[0].searchParams.get("app_id")).toBe(APP_ID);
		expect(requests[0].searchParams.get("base")).toBe("USD");
		expect(table).toEqual({
			date: "2026-09-26",
			source: "openexchangerates",
			rates: { EUR: 0.92, JPY: 150 },
		});
	});

	test("the same day is fetched once per client", async () => {
		const requests: URL[] = [];
		const fx = clientReturning({
			status: 200,
			body: {
				base: "USD",
				timestamp: CLOSE_OF_2026_09_26,
				rates: { EUR: 0.92 },
			},
			requests,
		});

		const first = await getUsdRateTable({ ctx: { fx }, date: "2026-09-26" });
		const second = await getUsdRateTable({ ctx: { fx }, date: "2026-09-26" });

		expect(requests).toHaveLength(1);
		expect(second).toBe(first);
	});

	test("a provider error surfaces its message and status, never the app id", async () => {
		const fx = clientReturning({
			status: 401,
			body: {
				error: true,
				status: 401,
				message: "invalid_app_id",
				description: "Invalid App ID provided.",
			},
			requests: [],
		});

		const failure = getUsdRateTable({ ctx: { fx }, date: "2026-09-26" });
		await expect(failure).rejects.toBeInstanceOf(FxProviderError);
		await expect(failure).rejects.toThrow("401");
		await expect(failure).rejects.toThrow("invalid_app_id");
		await failure.catch((error: Error) => {
			expect(error.message).not.toContain(APP_ID);
		});
	});

	test("a table published for a different day is refused", async () => {
		const fx = clientReturning({
			status: 200,
			body: {
				base: "USD",
				timestamp: CLOSE_OF_2026_09_26,
				rates: { EUR: 0.92 },
			},
			requests: [],
		});
		await expect(
			getUsdRateTable({ ctx: { fx }, date: "2026-09-25" }),
		).rejects.toThrow("provider returned 2026-09-26");
	});

	test("a non-USD base or malformed body is refused", async () => {
		const fx = clientReturning({
			status: 200,
			body: { base: "EUR", timestamp: CLOSE_OF_2026_09_26, rates: {} },
			requests: [],
		});
		await expect(
			getUsdRateTable({ ctx: { fx }, date: "2026-09-26" }),
		).rejects.toThrow("Unexpected rates response");
	});

	test("the date must be a UTC calendar day", async () => {
		const fx = clientReturning({ status: 200, body: {}, requests: [] });
		await expect(
			getUsdRateTable({ ctx: { fx }, date: "2026-09-26T11:00:00Z" }),
		).rejects.toThrow("YYYY-MM-DD");
	});
});
