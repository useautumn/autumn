/**
 * Contract: only billing request and Stripe webhook lines reach Maple, mapped
 * to OTLP records with shallow attributes; with no key the tap does not exist.
 */

import { describe, expect, spyOn, test } from "bun:test";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import {
	createMapleLogStreams,
	toMapleLogRecord,
} from "@/external/maple/createMapleLogStreams.js";
import { parseMapleLog } from "@/external/maple/parseMapleLog.js";

const isMapleLog = (line: string) => parseMapleLog(line) !== null;

const requestLine = ({
	name,
	msg,
	query = {},
}: {
	name: string;
	msg: string;
	query?: Record<string, string>;
}) =>
	`${JSON.stringify({
		level: "INFO",
		time: 1_760_000_000_000,
		deployment: "prod",
		context: { context: { org_id: "org_123", env: "sandbox" } },
		req: {
			id: "req_123",
			method: "POST",
			url: `https://api.example.com${name.split(" ")[1]}`,
			query,
			name,
			route: name,
		},
		statusCode: 200,
		msg,
	})}\n`;

const billingLine = requestLine({
	name: "POST /v1/billing.attach",
	msg: "[200] /v1/billing.attach (org_x) 412ms",
});

const stripeWebhookLine = `${JSON.stringify({
	level: "WARN",
	time: 1_760_000_000_000,
	stripe_event: { type: "invoice.paid", id: "evt_123", object_id: "in_123" },
	statusCode: 500,
	extras: { updates: [{ id: "cus_prod_123", status: "active" }] },
	msg: "STRIPE invoice.paid org_x | evt_123",
})}\n`;

describe("parseMapleLog", () => {
	test("accepts billing requests and Stripe webhooks", () => {
		expect(isMapleLog(billingLine)).toBe(true);
		expect(
			isMapleLog(
				requestLine({ name: "POST /v1/attach", msg: "[200] /v1/attach" }),
			),
		).toBe(true);
		expect(
			isMapleLog(
				requestLine({
					name: "POST /v1/setup_payment",
					msg: "[200] /v1/setup_payment",
				}),
			),
		).toBe(true);
		expect(isMapleLog(stripeWebhookLine)).toBe(true);
	});

	test("matches on req.name, not an earlier path-like value", () => {
		expect(
			isMapleLog(
				requestLine({
					name: "POST /v1/billing.attach",
					msg: "[200] /v1/billing.attach (org_x) 412ms",
					query: { note: "See /v1/check" },
				}),
			),
		).toBe(true);
		expect(
			isMapleLog(
				requestLine({
					name: "POST /v1/billing.attach",
					msg: "[200] /v1/billing.attach (org_x) 412ms",
					query: { name: "POST /v1/check" },
				}),
			),
		).toBe(true);
		expect(
			isMapleLog(
				requestLine({
					name: "POST /v1/balances.track",
					msg: "[200] /v1/balances.track (org_x) 3ms",
					query: { note: "See /v1/billing.attach" },
				}),
			),
		).toBe(false);
	});

	test("rejects billing-looking user data on non-billing requests", () => {
		const forgedBodyLine = `${JSON.stringify({
			level: "INFO",
			req: {
				query: { name: "POST /v1/check" },
				body: { name: "POST /v1/billing.attach", stripe_event: {} },
				name: "POST /v1/customers",
			},
			msg: "[200] /v1/customers (org_x) 5ms",
		})}\n`;
		const laterDataLine = `${JSON.stringify({
			level: "INFO",
			req: { name: "POST /v1/check" },
			data: { name: "POST /v1/billing.attach" },
			msg: "updated customer data",
		})}\n`;
		expect(isMapleLog(forgedBodyLine)).toBe(false);
		expect(isMapleLog(laterDataLine)).toBe(false);
	});

	test("rejects other requests and non-request lines", () => {
		expect(
			isMapleLog(
				requestLine({
					name: "POST /v1/balances.track",
					msg: "[200] /v1/balances.track (org_x) 3ms",
				}),
			),
		).toBe(false);
		expect(
			isMapleLog(
				JSON.stringify({
					level: "INFO",
					workflow: { name: "billing-sync" },
					msg: "worker done",
				}),
			),
		).toBe(false);
	});
});

describe("toMapleLogRecord", () => {
	test("maps a pino line to an OTLP record with shallow attributes", () => {
		expect(toMapleLogRecord(JSON.parse(stripeWebhookLine))).toEqual({
			body: "STRIPE invoice.paid org_x | evt_123",
			severityText: "WARN",
			severityNumber: 13,
			timestamp: 1_760_000_000_000,
			attributes: {
				stripe_event:
					'{"type":"invoice.paid","id":"evt_123","object_id":"in_123"}',
				statusCode: 500,
				extras: '{"updates":[{"id":"cus_prod_123","status":"active"}]}',
			},
		});
	});
});

describe("createMapleLogStreams", () => {
	test("adds no stream without MAPLE_INGEST_KEY", () => {
		const previousKey = process.env.MAPLE_INGEST_KEY;
		delete process.env.MAPLE_INGEST_KEY;
		try {
			expect(createMapleLogStreams()).toEqual([]);
		} finally {
			if (previousKey !== undefined) process.env.MAPLE_INGEST_KEY = previousKey;
		}
	});

	test("exports matching lines in batches and drops the rest", async () => {
		const previousKey = process.env.MAPLE_INGEST_KEY;
		process.env.MAPLE_INGEST_KEY = "maple_sk_test";
		const exported: { body?: unknown }[] = [];
		const exportSpy = spyOn(
			OTLPLogExporter.prototype,
			"export",
		).mockImplementation((records, resultCallback) => {
			exported.push(...records);
			resultCallback({ code: 0 });
		});
		try {
			const [entry] = createMapleLogStreams();
			expect(entry.level).toBe("info");

			entry.stream.write(requestLine({ name: "POST /v1/check", msg: "check" }));
			entry.stream.write('{"stripe_event":{ broken');
			for (let i = 0; i < 512; i++) entry.stream.write(billingLine);
			await Bun.sleep(10);

			expect(exported).toHaveLength(512);
			expect(exported[0].body).toBe("[200] /v1/billing.attach (org_x) 412ms");
		} finally {
			exportSpy.mockRestore();
			if (previousKey === undefined) delete process.env.MAPLE_INGEST_KEY;
			else process.env.MAPLE_INGEST_KEY = previousKey;
		}
	});
});
