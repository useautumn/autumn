import { describe, expect, test } from "bun:test";
import { buildRequestResultRecords } from "../../../src/honoMiddlewares/requestLogging/buildRequestResultRecords.js";

const request = {
	requestId: "req_123",
	requestMethod: "POST",
	requestPath: "/v1/balances.check",
	requestBody: { customer_id: "cus_123", feature_id: "messages" },
	orgId: "org_123",
	customerId: "cus_123",
	entityId: null,
	environment: "live",
	eventTime: "2026-07-27T12:00:00.000Z",
	archiveSuccessResponse: true,
};

describe("buildRequestResultRecords", () => {
	test("keeps a compact Axiom success record and archives the complete payload", () => {
		const records = buildRequestResultRecords({
			...request,
			statusCode: 200,
			durationMs: 12,
			responseBody: {
				allowed: true,
				balance: { remaining: 999 },
			},
		});

		expect(records.axiom).toEqual({
			statusCode: 200,
			durationMs: 12,
			responseBodyBytes: 44,
			responseArchiveRouted: true,
			res: {
				allowed: true,
				balance: { remaining: 999 },
			},
		});
		expect(records.archive).toEqual({
			log_destination: "request_log_archive",
			event_time: "2026-07-27T12:00:00.000Z",
			request_id: "req_123",
			request_method: "POST",
			request_path: "/v1/balances.check",
			status_code: 200,
			duration_ms: 12,
			org_id: "org_123",
			customer_id: "cus_123",
			entity_id: null,
			environment: "live",
			request_body: '{"customer_id":"cus_123","feature_id":"messages"}',
			response_body: '{"allowed":true,"balance":{"remaining":999}}',
			response_body_bytes: 44,
		});
	});

	test("keeps error bodies in Axiom and does not duplicate them into the archive", () => {
		const responseBody = { code: "invalid_request", message: "No customer" };
		const records = buildRequestResultRecords({
			...request,
			statusCode: 400,
			durationMs: 9,
			responseBody,
		});

		expect(records.axiom.res).toEqual(responseBody);
		expect(records.axiom.responseArchiveRouted).toBe(false);
		expect(records.archive).toBeNull();
	});

	test("keeps queryable response signals but drops high-cardinality success data", () => {
		const records = buildRequestResultRecords({
			...request,
			statusCode: 200,
			durationMs: 7,
			responseBody: {
				allowed: false,
				code: "insufficient_balance",
				balance: {
					granted: 100,
					remaining: 0,
					usage: 100,
					breakdown: [{ id: "grant_1", remaining: 0 }],
				},
				balances: {
					messages: { breakdown: [{ id: "grant_1", remaining: 0 }] },
				},
			},
		});

		expect(records.axiom.res).toEqual({
			allowed: false,
			code: "insufficient_balance",
			balance: {
				granted: 100,
				remaining: 0,
				usage: 100,
			},
		});
		expect(records.archive?.response_body).toContain('"breakdown"');
		expect(records.archive?.response_body).toContain('"balances"');
	});

	test("keeps a success body in Axiom when the archive is unavailable", () => {
		const responseBody = { allowed: true };
		const records = buildRequestResultRecords({
			...request,
			statusCode: 200,
			durationMs: 7,
			responseBody,
			archiveSuccessResponse: false,
		});

		expect(records.axiom.res).toEqual(responseBody);
		expect(records.axiom.responseArchiveRouted).toBe(false);
		expect(records.archive).toBeNull();
	});
});
