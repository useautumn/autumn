import { describe, expect, it } from "bun:test";
import { errorReportingOptionsOf } from "../../../../src/external/sentry/errorReportingOptionsOf.js";

const SAZABI_DSN = "https://sazabi@abc.us-west-2.intake.sazabi.com/0";
const SENTRY_DSN = "https://key@o1.ingest.us.sentry.io/2";

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

	it("makes Sazabi primary and mirrors to Sentry when both are set", () => {
		const options = errorReportingOptionsOf({
			env: { SAZABI_DSN, SENTRY_DSN },
		});
		expect(options?.dsn).toBe(SAZABI_DSN);
		expect(typeof options?.transport).toBe("function");
	});
});
