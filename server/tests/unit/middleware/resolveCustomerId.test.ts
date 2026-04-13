import { describe, expect, test } from "bun:test";
import chalk from "chalk";
import { resolveCustomerId } from "@/honoMiddlewares/utils/resolveCustomerId.js";

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

		test("extracts customer_id from nested entity routes", () => {
			expect(
				resolveCustomerId({
					method: "GET",
					path: "/v1/customers/cus_123/entities/ent_1",
				}),
			).toBe("cus_123");
		});

		test("extracts customer_id from /v1/customers/:customer_id/entities/:entity_id/balances", () => {
			expect(
				resolveCustomerId({
					method: "POST",
					path: "/v1/customers/cus_abc/entities/ent_1/balances",
				}),
			).toBe("cus_abc");
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
		test("extracts customer_id from RPC body", () => {
			expect(
				resolveCustomerId({
					method: "POST",
					path: "/v1/billing.attach",
					body: { customer_id: "cus_rpc" },
				}),
			).toBe("cus_rpc");
		});

		test("extracts customer_id from check route", () => {
			expect(
				resolveCustomerId({
					method: "POST",
					path: "/v1/check",
					body: { customer_id: "cus_check", feature_id: "feat_1" },
				}),
			).toBe("cus_check");
		});

		test("extracts id from POST /v1/customers", () => {
			expect(
				resolveCustomerId({
					method: "POST",
					path: "/v1/customers",
					body: { id: "cus_new", name: "Test" },
				}),
			).toBe("cus_new");
		});

		test("does not use body.id for customers.get_or_create", () => {
			expect(
				resolveCustomerId({
					method: "POST",
					path: "/v1/customers.get_or_create",
					body: { id: "wrong", customer_id: "cus_right" },
				}),
			).toBe("cus_right");
		});
	});

	describe(chalk.cyan("query param parsing"), () => {
		test("extracts customer_id from query", () => {
			expect(
				resolveCustomerId({
					method: "GET",
					path: "/v1/balances/list",
					query: { customer_id: "cus_query" },
				}),
			).toBe("cus_query");
		});
	});

	describe(chalk.cyan("no customer_id"), () => {
		test("returns undefined for org routes", () => {
			expect(
				resolveCustomerId({
					method: "GET",
					path: "/v1/organization",
				}),
			).toBeUndefined();
		});
	});
});
