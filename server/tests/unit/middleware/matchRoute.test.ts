import { describe, expect, test } from "bun:test";
import { matchRoute } from "@/honoMiddlewares/middlewareUtils.js";

// Real patterns from refreshCacheConfigs.ts / rateLimitConfigs.ts.
const exactPattern = { method: "POST", url: "/v1/attach" };
const rpcPattern = { method: "POST", url: "/v1/billing.attach" };
const paramPattern = { method: "POST", url: "/customers/:customer_id" };
const doubleParamPattern = {
	method: "POST",
	url: "/customers/:customer_id/entitlements/:customer_entitlement_id",
};

describe("matchRoute", () => {
	test("matches exact patterns and rejects sub-paths and wrong methods", () => {
		expect(
			matchRoute({ url: "/v1/attach", method: "POST", pattern: exactPattern }),
		).toBe(true);
		expect(
			matchRoute({
				url: "/v1/attach/preview",
				method: "POST",
				pattern: exactPattern,
			}),
		).toBe(false);
		expect(
			matchRoute({ url: "/v1/attach", method: "GET", pattern: exactPattern }),
		).toBe(false);
		expect(
			matchRoute({
				url: "/v1/billing.attach",
				method: "POST",
				pattern: rpcPattern,
			}),
		).toBe(true);
	});

	test("matches param patterns against concrete segments only", () => {
		expect(
			matchRoute({
				url: "/customers/cus_123",
				method: "POST",
				pattern: paramPattern,
			}),
		).toBe(true);
		expect(
			matchRoute({
				url: "/customers/cus_123/events",
				method: "POST",
				pattern: paramPattern,
			}),
		).toBe(false);
		expect(
			matchRoute({ url: "/customers/", method: "POST", pattern: paramPattern }),
		).toBe(false);
		expect(
			matchRoute({
				url: "/customers/cus_123/entitlements/ce_456",
				method: "POST",
				pattern: doubleParamPattern,
			}),
		).toBe(true);
		expect(
			matchRoute({
				url: "/customers/cus_123/entitlements",
				method: "POST",
				pattern: doubleParamPattern,
			}),
		).toBe(false);
	});

	test("returns consistent results on repeated calls with the same pattern", () => {
		for (let i = 0; i < 3; i++) {
			expect(
				matchRoute({
					url: "/customers/cus_123",
					method: "POST",
					pattern: paramPattern,
				}),
			).toBe(true);
			expect(
				matchRoute({
					url: "/customers/cus_123/events",
					method: "POST",
					pattern: paramPattern,
				}),
			).toBe(false);
			expect(
				matchRoute({
					url: "/v1/attach",
					method: "POST",
					pattern: exactPattern,
				}),
			).toBe(true);
		}
	});
});
