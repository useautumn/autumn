import { describe, expect, test } from "bun:test";
import { apiRequestCatalog } from "../../../../src/apiRequests/apiRequestCatalog";
import {
	apiCallsApl,
	endpointIdAplExpression,
	requestPathAplExpression,
} from "../../../../src/apiRequests/utils/apiCallsApl";
import { pathNormalizationSteps } from "../../../../src/apiRequests/utils/normalizeRequestPath";
import { closedHourWindows } from "../../../../src/utils/closedHourWindows";

describe("api calls APL", () => {
	test("path expression applies every normalisation step, innermost first", () => {
		const expression = requestPathAplExpression();
		expect(expression.startsWith("replace_regex(")).toBe(true);
		expect(expression).toContain("tostring(['req.url'])");
		const positions = pathNormalizationSteps.map((step) =>
			expression.indexOf(step.pattern.replace(/\\/g, "\\\\")),
		);
		// later steps wrap earlier ones, so they appear earlier in the string
		expect([...positions].reverse()).toEqual(
			[...positions].reverse().sort((a, b) => a - b),
		);
	});

	test("endpoint case() lists every catalog route once, literals before params, '' default", () => {
		const expression = endpointIdAplExpression();
		for (const endpoint of apiRequestCatalog) {
			expect(expression).toContain(`'${endpoint.id}'`);
		}
		expect(expression).toContain("path == '/check'");
		expect(expression).toContain("path matches regex '^/customers/[^/]+$'");
		expect(expression.indexOf("path == '/customers'")).toBeLessThan(
			expression.indexOf("matches regex"),
		);
		expect(expression.trimEnd().endsWith("'')")).toBe(true);
	});

	test("full query filters live 2xx key/token traffic over the window and weights batch endpoints", () => {
		const windows = closedHourWindows({
			nowMs: Date.parse("2026-09-27T12:15:00Z"),
			count: 3,
		});
		const apl = apiCallsApl({ windows });
		expect(apl).toContain(
			"_time >= datetime(2026-09-27T09:00:00.000Z) and _time < datetime(2026-09-27T12:00:00.000Z)",
		);
		expect(apl).toContain("statusCode >= 200 and statusCode < 300");
		expect(apl).toContain("['context.env'] == 'live'");
		expect(apl).toContain(
			"['context.auth_type'] in ('secret_key', 'customer_jwt')",
		);
		expect(apl).toContain(
			"endpoint_id in ('balances.batch_track', 'balances.batch_update')",
		);
		expect(apl).toContain(
			"coalesce(tolong(parse_json(tostring(extras))['item_count']), array_length(parse_json(tostring(['req.body']))), 1)",
		);
		expect(apl).toContain(
			"summarize requests = sum(requests) by org_id = tostring(['context.org_id']), org_slug = tostring(['context.org_slug']), hour = tostring(bin(_time, 1h)), endpoint_id",
		);
	});
});
