import { describe, expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import { buildRequestLogsApl } from "@/internal/logs/actions/searchRequestLogs/buildRequestLogsApl.js";
import {
	parseRestrictedApl,
	restrictedAplToApl,
} from "@/internal/logs/parser/restrictedApl.js";

const normalize = (value: string) => value.replace(/\s+/g, " ").trim();

describe("restricted request-log APL", () => {
	test("parses where, order, and limit stages over projected fields", () => {
		const ast = parseRestrictedApl({
			query:
				"| where request_body contains 'price_id' and status_code >= 400 | order by timestamp desc | limit 50",
		});

		expect(restrictedAplToApl(ast)).toEqual([
			"| where (dynamic_to_json(request_body) contains 'price_id' and status_code >= 400)",
			"| order by timestamp desc",
			"| limit 50",
		]);
	});

	test("parses public-safe source and Stripe webhook fields", () => {
		const ast = parseRestrictedApl({
			query:
				"where source == 'stripe_webhook' and stripe_event_type == 'customer.subscription.updated' and stripe_object_id == 'sub_123' | order by timestamp desc | limit 25",
		});

		expect(restrictedAplToApl(ast)).toEqual([
			"| where ((source == 'stripe_webhook' and stripe_event_type == 'customer.subscription.updated') and stripe_object_id == 'sub_123')",
			"| order by timestamp desc",
			"| limit 25",
		]);
	});

	test("parses nested request and response body predicates", () => {
		const ast = parseRestrictedApl({
			query:
				"where request_body.feature_id == 'credits' and response_body.allowed == false and response_body.balance.remaining > 0",
		});

		expect(restrictedAplToApl(ast)).toEqual([
			"| where ((tostring(request_body['feature_id']) == 'credits' and tobool(response_body['allowed']) == false) and todouble(response_body['balance']['remaining']) > 0)",
		]);
	});

	test("parses nested body fields in aggregate queries", () => {
		const ast = parseRestrictedApl({
			query:
				"where customer_id == 'cus_123' and request_body.event_name in ('credits', 'tokens') | summarize requests = count(), denied = countif(response_body.allowed == false) by request_body.event_name | project event_name = request_body_event_name, requests, denied | order by requests desc | limit 20",
			allowedStages: ["where", "summarize", "project", "orderBy", "limit"],
		});

		expect(restrictedAplToApl(ast)).toEqual([
			"| where (customer_id == 'cus_123' and tostring(request_body['event_name']) in ('credits', 'tokens'))",
			"| summarize requests = count(), denied = countif(tobool(response_body['allowed']) == false) by request_body_event_name = tostring(request_body['event_name'])",
			"| project event_name = request_body_event_name, requests, denied",
			"| order by requests desc",
			"| limit 20",
		]);
	});

	test("parses nested body fields in project stages", () => {
		const ast = parseRestrictedApl({
			query:
				"project feature = request_body.feature_id, response_body.balance.remaining",
			allowedStages: ["project"],
		});

		expect(restrictedAplToApl(ast)).toEqual([
			"| project feature = tostring(request_body['feature_id']), response_body_balance_remaining = tostring(response_body['balance']['remaining'])",
		]);
	});

	test("escapes strings when compiling back to APL", () => {
		const ast = parseRestrictedApl({
			query: "where request_body contains 'it\\'s ok'",
		});

		expect(restrictedAplToApl(ast)).toEqual([
			"| where dynamic_to_json(request_body) contains 'it\\'s ok'",
		]);
	});

	test("rejects dataset sources and raw APL field syntax", () => {
		expect(() =>
			parseRestrictedApl({ query: "['express'] | limit 10" }),
		).toThrow("unsupported syntax");
		expect(() =>
			parseRestrictedApl({ query: "where ['req.url'] contains '/v1'" }),
		).toThrow("unsupported syntax");
	});

	test("rejects unsupported stages and comments", () => {
		expect(() => parseRestrictedApl({ query: "project request_body" })).toThrow(
			"Unsupported query stage",
		);
		expect(() =>
			parseRestrictedApl({ query: "where status_code == 200 // test" }),
		).toThrow("comments are not supported");
	});

	test("rejects unknown fields and unsafe limits", () => {
		expect(() =>
			parseRestrictedApl({ query: "where secret contains 'x'" }),
		).toThrow("Unknown query field");
		expect(() =>
			parseRestrictedApl({ query: "where extras contains 'x'" }),
		).toThrow("Unknown query field");
		expect(() =>
			parseRestrictedApl({ query: "where workflow contains 'x'" }),
		).toThrow("Unknown query field");
		expect(() =>
			parseRestrictedApl({
				query: "where stripe_webhook_route == 'connect'",
			}),
		).toThrow("Unknown query field");
		expect(() =>
			parseRestrictedApl({
				query:
					"where request_body.feature_id.value.extra.too_deep.really_too_deep == 'x'",
			}),
		).toThrow("Nested query field must have 1-4 path segments");
		expect(() =>
			parseRestrictedApl({
				query: "where response_body.balances.api-calls.remaining == 1",
			}),
		).toThrow();
		expect(() => parseRestrictedApl({ query: "limit 500" })).toThrow(
			"limit must be between 1 and 200",
		);
	});

	test("rejects user-authored raw body access and parsing functions", () => {
		expect(() =>
			parseRestrictedApl({
				query: "where request_body['feature_id'] == 'credits'",
			}),
		).toThrow("unsupported syntax");
		expect(() =>
			parseRestrictedApl({
				query: "where parse_json(request_body).feature_id == 'credits'",
			}),
		).toThrow("Unsupported query character");
		expect(() =>
			parseRestrictedApl({
				query: "where todynamic(response_body).allowed == false",
			}),
		).toThrow("Unsupported query character");
	});

	test("parses aggregate query stages", () => {
		const ast = parseRestrictedApl({
			query:
				"where status_code >= 400 | summarize errors = count(), failures = countif(status_code >= 500) by request_path | order by errors desc | limit 10",
			allowedStages: ["where", "summarize", "orderBy", "limit"],
		});

		expect(restrictedAplToApl(ast)).toEqual([
			"| where status_code >= 400",
			"| summarize errors = count(), failures = countif(status_code >= 500) by request_path",
			"| order by errors desc",
			"| limit 10",
		]);
	});

	test("parses project stages over safe result aliases", () => {
		const ast = parseRestrictedApl({
			query:
				"summarize total = count() by request_method | project method = request_method, total",
			allowedStages: ["summarize", "project"],
		});

		expect(restrictedAplToApl(ast)).toEqual([
			"| summarize total = count() by request_method",
			"| project method = request_method, total",
		]);
	});

	test("rejects aggregate stages when caller disallows them", () => {
		expect(() =>
			parseRestrictedApl({
				query: "summarize total = count() by request_path",
				allowedStages: ["where", "orderBy", "limit"],
			}),
		).toThrow("Unsupported query stage: summarize");
	});

	test("rejects unsupported aggregate functions", () => {
		expect(() =>
			parseRestrictedApl({
				query: "summarize total = dcount(customer_id) by request_path",
				allowedStages: ["summarize"],
			}),
		).toThrow("Unsupported summarize function: dcount");
	});

	test("builds tenant-projected APL before appending user stages", () => {
		const apl = buildRequestLogsApl({
			ctx: {
				org: { id: "org_123", slug: "acme" },
				env: AppEnv.Sandbox,
			},
			query: "where response_body contains 'checkout'",
			limit: 25,
		});

		expect(normalize(apl)).toContain("['express'] | where");
		expect(apl).toContain("['context.org_id'] == 'org_123'");
		expect(apl).toContain("['context.org_slug'] == 'acme'");
		expect(apl).toContain("['context.env'] == 'sandbox'");
		expect(apl).not.toContain("context.orgId");
		expect(apl).not.toContain("context.orgSlug");
		expect(apl).toContain(
			"request_path = tostring(parse_url(['req.url']).path)",
		);
		expect(apl).toContain(
			"source = case(request_path startswith '/v1', 'api_request'",
		);
		expect(apl).not.toContain("stripe_webhook_route");
		expect(apl).toContain(
			"| where source in ('api_request', 'stripe_webhook')",
		);
		expect(apl).toContain(
			"| project timestamp = _time, source = source, status_code = statusCode",
		);
		expect(apl).toContain("stripe_event_id = ['stripe_event.id']");
		expect(apl).toContain(
			"| where dynamic_to_json(response_body) contains 'checkout'",
		);
		expect(apl).toContain("| limit 25");
	});

	test("can omit default timestamp ordering for aggregate queries", () => {
		const apl = buildRequestLogsApl({
			ctx: {
				org: { id: "org_123", slug: "acme" },
				env: AppEnv.Sandbox,
			},
			query: "summarize total = count() by request_path",
			limit: 25,
			allowedStages: ["summarize"],
			appendDefaultOrder: false,
		});

		expect(apl).toContain("| summarize total = count() by request_path");
		expect(apl).not.toContain("| order by timestamp desc");
		expect(apl).toContain("| limit 25");
	});

	test("escapes tenant values in generated APL", () => {
		const apl = buildRequestLogsApl({
			ctx: {
				org: { id: "org_'x", slug: "slug\\x" },
				env: AppEnv.Live,
			},
			limit: 10,
		});

		expect(apl).toContain("org_\\'x");
		expect(apl).toContain("slug\\\\x");
	});
});
