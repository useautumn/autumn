import { describe, expect, it } from "bun:test";
import { isRoutineWarning } from "../../src/otlp/isRoutineWarning.js";
import {
	pinoLineToOtlpLogRecord,
	sazabiIntakeUrlOf,
} from "../../src/otlp/sazabiLogStream.js";

const SAZABI_INTAKE_URL = "https://abc.us-west-2.intake.sazabi.com/";

describe("sazabiIntakeUrlOf", () => {
	it("is off without an intake URL", () => {
		expect(sazabiIntakeUrlOf({ env: { NODE_ENV: "production" } })).toBe(
			undefined,
		);
	});

	it("trims the trailing slash in production", () => {
		expect(
			sazabiIntakeUrlOf({ env: { NODE_ENV: "production", SAZABI_INTAKE_URL } }),
		).toBe("https://abc.us-west-2.intake.sazabi.com");
	});

	it("stays off in dev unless SAZABI_DEV_LOGS=1", () => {
		const env = { NODE_ENV: "development", SAZABI_INTAKE_URL };
		expect(sazabiIntakeUrlOf({ env })).toBeUndefined();
		expect(sazabiIntakeUrlOf({ env: { ...env, SAZABI_DEV_LOGS: "1" } })).toBe(
			"https://abc.us-west-2.intake.sazabi.com",
		);
	});
});

describe("pinoLineToOtlpLogRecord", () => {
	it("maps level to severity and flattens nested objects", () => {
		expect(
			pinoLineToOtlpLogRecord({
				msg: "boom",
				level: "ERROR",
				time: 1,
				service: "server",
				context: { org_id: "org_123" },
			}),
		).toEqual({
			body: "boom",
			severityText: "ERROR",
			severityNumber: 17,
			timestamp: 1,
			attributes: { service: "server", context: '{"org_id":"org_123"}' },
		});
	});
});

describe("isRoutineWarning", () => {
	it("drops 4xx request lines but keeps 5xx", () => {
		expect(isRoutineWarning({ statusCode: 409 })).toBe(true);
		expect(isRoutineWarning({ statusCode: 404 })).toBe(true);
		expect(isRoutineWarning({ statusCode: 500 })).toBe(false);
	});

	it("drops expected failures but keeps infra and bug", () => {
		expect(isRoutineWarning({ error: { kind: "expected" } })).toBe(true);
		expect(isRoutineWarning({ error: { kind: "infra" } })).toBe(false);
		expect(isRoutineWarning({ error: { kind: "bug" } })).toBe(false);
	});

	it("keeps lines with neither signal", () => {
		expect(isRoutineWarning({})).toBe(false);
		expect(isRoutineWarning({ error: "boom", statusCode: "409" })).toBe(false);
	});
});
