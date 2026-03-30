import { describe, expect, test } from "bun:test";
import chalk from "chalk";
import { resolveCustomerId } from "@/honoMiddlewares/utils/resolveCustomerId";

describe(chalk.yellowBright("resolveCustomerId"), () => {
	describe(chalk.cyan("URL path parsing"), () => {
		test("extracts customer_id from /v1/customers/:customer_id", () => {
			expect(
				resolveCustomerId({
					method: "GET",
					path: "/v1/customers/cus_123",
				}),
			).toBe("cus_123");
		});

		test("extracts customer_id from /v1/customers/:customer_id/entities", () => {
			expect(
				resolveCustomerId({
					method: "GET",
					path: "/v1/customers/cus_123/entities",
				}),
			).toBe("cus_123");
		});

		test("extracts customer_id from /v1/customers/:customer_id/billing_portal", () => {
			expect(
				resolveCustomerId({
					method: "POST",
					path: "/v1/customers/cus_abc/billing_portal",
				}),
			).toBe("cus_abc");
		});

		test("ignores non-v1 paths", () => {
			expect(
				resolveCustomerId({
					method: "GET",
					path: "/health/customers/cus_123",
				}),
			).toBeUndefined();
		});

		test("URL takes priority over body customer_id", () => {
			expect(
				resolveCustomerId({
					method: "POST",
					path: "/v1/customers/cus_url",
					body: { customer_id: "cus_body" },
				}),
			).toBe("cus_url");
		});
	});

	describe(chalk.cyan("body parsing"), () => {
		test("extracts customer_id from POST body", () => {
			expect(
				resolveCustomerId({
					method: "POST",
					path: "/v1/attach",
					body: { customer_id: "cus_456" },
				}),
			).toBe("cus_456");
		});

		test("extracts customer_id from PATCH body", () => {
			expect(
				resolveCustomerId({
					method: "PATCH",
					path: "/v1/organization",
					body: { customer_id: "cus_789" },
				}),
			).toBe("cus_789");
		});

		test("ignores body for GET requests", () => {
			expect(
				resolveCustomerId({
					method: "GET",
					path: "/v1/products",
					body: { customer_id: "cus_xxx" },
				}),
			).toBeUndefined();
		});

		test("extracts id from POST /v1/customers (create customer)", () => {
			expect(
				resolveCustomerId({
					method: "POST",
					path: "/v1/customers",
					body: { id: "cus_new", name: "Test" },
				}),
			).toBe("cus_new");
		});

		test("does NOT use body.id for customers.get_or_create", () => {
			expect(
				resolveCustomerId({
					method: "POST",
					path: "/v1/customers.get_or_create",
					body: { id: "wrong", customer_id: "cus_right" },
				}),
			).toBe("cus_right");
		});

		test("handles RPC routes (billing.attach)", () => {
			expect(
				resolveCustomerId({
					method: "POST",
					path: "/v1/billing.attach",
					body: { customer_id: "cus_rpc" },
				}),
			).toBe("cus_rpc");
		});

		test("handles check route", () => {
			expect(
				resolveCustomerId({
					method: "POST",
					path: "/v1/check",
					body: { customer_id: "cus_check", feature_id: "feat_1" },
				}),
			).toBe("cus_check");
		});

		test("handles track route", () => {
			expect(
				resolveCustomerId({
					method: "POST",
					path: "/v1/track",
					body: { customer_id: "cus_track", feature_id: "feat_1", delta: 5 },
				}),
			).toBe("cus_track");
		});
	});

	describe(chalk.cyan("query param parsing"), () => {
		test("extracts customer_id from query for GET requests", () => {
			expect(
				resolveCustomerId({
					method: "GET",
					path: "/v1/balances/list",
					query: { customer_id: "cus_query" },
				}),
			).toBe("cus_query");
		});

		test("query falls back after URL and body miss", () => {
			expect(
				resolveCustomerId({
					method: "POST",
					path: "/v1/some/endpoint",
					body: {},
					query: { customer_id: "cus_fallback" },
				}),
			).toBe("cus_fallback");
		});
	});

	describe(chalk.cyan("no customer_id"), () => {
		test("returns undefined for product routes", () => {
			expect(
				resolveCustomerId({
					method: "POST",
					path: "/v1/products",
					body: { name: "Pro Plan" },
				}),
			).toBeUndefined();
		});

		test("returns undefined for org routes", () => {
			expect(
				resolveCustomerId({
					method: "GET",
					path: "/v1/organization",
				}),
			).toBeUndefined();
		});

		test("returns undefined for balances.finalize (only has lock_id)", () => {
			expect(
				resolveCustomerId({
					method: "POST",
					path: "/v1/balances.finalize",
					body: { lock_id: "lock_abc" },
				}),
			).toBeUndefined();
		});

		test("returns undefined when body is undefined", () => {
			expect(
				resolveCustomerId({
					method: "POST",
					path: "/v1/attach",
				}),
			).toBeUndefined();
		});
	});
});
