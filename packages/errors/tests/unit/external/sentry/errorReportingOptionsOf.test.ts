import { afterEach, describe, expect, it } from "bun:test";
import { createEnvelope } from "@sentry/core";
import { errorReportingOptionsOf } from "../../../../src/external/sentry/errorReportingOptionsOf.js";

const SAZABI_DSN = "https://sazabi@abc.us-west-2.intake.sazabi.com/0";
const SENTRY_DSN = "https://key@o1.ingest.us.sentry.io/2";

const originalFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = originalFetch;
});

const deliveredUrlsOf = async (
	transport: NonNullable<
		ReturnType<typeof errorReportingOptionsOf>
	>["transport"],
) => {
	const urls: string[] = [];
	globalThis.fetch = (async (input: string | URL | Request) => {
		urls.push(String(input instanceof Request ? input.url : input));
		return new Response("{}", { status: 200 });
	}) as typeof fetch;

	const send = transport?.({
		url: "https://fallback.invalid/api/9/envelope/",
		recordDroppedEvent: () => {},
	});
	await send?.send(
		createEnvelope({ event_id: "a".repeat(32), sent_at: "" }, [
			[{ type: "event" }, { event_id: "a".repeat(32), message: "boom" }],
		]),
	);
	return urls;
};

describe("errorReportingOptionsOf", () => {
	it("is off without a DSN", () => {
		expect(errorReportingOptionsOf({ env: {} })).toBeUndefined();
	});

	it("sends to Sazabi alone when only its DSN is set", () => {
		expect(errorReportingOptionsOf({ env: { SAZABI_DSN } })).toEqual({
			dsn: SAZABI_DSN,
		});
	});

	it("keeps a Sentry-only setup working", () => {
		expect(errorReportingOptionsOf({ env: { SENTRY_DSN } })).toEqual({
			dsn: SENTRY_DSN,
		});
	});

	it("makes Sazabi primary and delivers every event to both projects", async () => {
		const options = errorReportingOptionsOf({
			env: { SAZABI_DSN, SENTRY_DSN },
		});
		expect(options?.dsn).toBe(SAZABI_DSN);

		const urls = await deliveredUrlsOf(options?.transport);
		expect(urls).toHaveLength(2);
		expect(
			urls.some((url) =>
				url.startsWith(
					"https://abc.us-west-2.intake.sazabi.com/api/0/envelope/",
				),
			),
		).toBe(true);
		expect(
			urls.some((url) =>
				url.startsWith("https://o1.ingest.us.sentry.io/api/2/envelope/"),
			),
		).toBe(true);
	});
});
