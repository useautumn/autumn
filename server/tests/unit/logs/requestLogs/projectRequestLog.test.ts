import { describe, expect, test } from "bun:test";
import {
	isExternalRequestLog,
	projectRequestLog,
} from "@/internal/logs/actions/searchRequestLogs/projectRequestLog.js";

describe("projectRequestLog", () => {
	test("projects the public request log shape", () => {
		const log = projectRequestLog({
			_time: "2026-06-06T10:00:00Z",
			data: {
				timestamp: "2026-06-06T10:00:00Z",
				source: "api_request",
				status_code: 201,
				duration_ms: 123,
				message: "not public",
				request_method: "POST",
				request_url: "https://api.useautumn.com/v1/customers",
				request_path: "/v1/customers",
				request_body: { id: "cus_123" },
				response_body: { ok: true },
				org_id: "org_123",
				customer_id: "cus_123",
				entity_id: "ent_123",
			},
		});

		expect(log).toEqual({
			timestamp: "2026-06-06T10:00:00Z",
			source: "api_request",
			status_code: 201,
			request: {
				method: "POST",
				url: "https://api.useautumn.com/v1/customers",
				path: "/v1/customers",
			},
			context: {
				org_id: "org_123",
				customer_id: "cus_123",
				entity_id: "ent_123",
			},
			stripe: {
				event_id: null,
				event_type: null,
				object_id: null,
			},
			request_body: { id: "cus_123" },
			response_body: { ok: true },
		});

		expect("id" in log).toBe(false);
		expect("duration_ms" in log).toBe(false);
		expect("message" in log).toBe(false);
		expect(isExternalRequestLog(log)).toBe(true);
	});

	test("falls back to raw fields and derives path from URL", () => {
		const log = projectRequestLog({
			_time: "2026-06-06T10:00:00Z",
			data: {
				statusCode: 500,
				"req.method": "GET",
				"req.url": "https://api.useautumn.com/v1/check?x=1",
				"req.body": null,
				res: { error: "failed" },
				"context.org_id": "org_123",
				"req.customer_id": "cus_123",
			},
		});

		expect(log.request.path).toBe("/v1/check");
		expect(log.context.org_id).toBe("org_123");
		expect(log.context.customer_id).toBe("cus_123");
		expect(log.response_body).toEqual({ error: "failed" });
	});

	test("projects public-safe Stripe webhook fields", () => {
		const log = projectRequestLog({
			_time: "2026-06-06T10:00:00Z",
			data: {
				status_code: 200,
				request_method: "POST",
				request_url: "https://api.useautumn.com/webhooks/connect/live",
				request_path: "/webhooks/connect/live",
				request_body: { id: "evt_123" },
				response_body: { received: true },
				org_id: "org_123",
				customer_id: "cus_123",
				stripe_event_id: "evt_123",
				stripe_event_type: "customer.subscription.updated",
				stripe_object_id: "sub_123",
			},
		});

		expect(log.source).toBe("stripe_webhook");
		expect(log.request.path).toBe("/webhooks/connect/live");
		expect(log.stripe).toEqual({
			event_id: "evt_123",
			event_type: "customer.subscription.updated",
			object_id: "sub_123",
		});
		expect(isExternalRequestLog(log)).toBe(true);
	});

	test("derives Stripe webhook source from path", () => {
		const log = projectRequestLog({
			_time: "2026-06-06T10:00:00Z",
			data: {
				status_code: 200,
				request_url: "https://api.useautumn.com/webhooks/stripe/org_123/live",
			},
		});

		expect(log.source).toBe("stripe_webhook");
		expect("webhook_route" in log.stripe).toBe(false);
		expect(isExternalRequestLog(log)).toBe(true);
	});

	test("filters non-v1 paths", () => {
		const log = projectRequestLog({
			_time: "2026-06-06T10:00:00Z",
			data: {
				status_code: 200,
				request_url: "https://api.useautumn.com/slack/events",
			},
		});

		expect(isExternalRequestLog(log)).toBe(false);
	});
});
