import { describe, expect, it } from "bun:test";
import { sazabiIntakeUrlOf } from "../../src/otlp/sazabiConfig.js";
import { pinoLineToOtlpLogRecord } from "../../src/otlp/sazabiLogStream.js";
import { createSazabiTriggerLogExporters } from "../../src/otlp/sazabiTriggerLogExporters.js";

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

describe("createSazabiTriggerLogExporters", () => {
	it("is empty when Sazabi is off", () => {
		expect(createSazabiTriggerLogExporters({ env: {} })).toEqual([]);
	});

	it("skips the network when every record is below the threshold", () => {
		const [exporter] = createSazabiTriggerLogExporters({
			env: { NODE_ENV: "production", SAZABI_INTAKE_URL },
		});
		let code: number | undefined;
		exporter?.export(
			[{ severityNumber: 9 }] as Parameters<typeof exporter.export>[0],
			(result) => {
				code = result.code;
			},
		);
		expect(code).toBe(0);
	});
});
