import { describe, expect, test } from "bun:test";
import { resolveReplicaDbLane } from "@/internal/misc/replicaDb/replicaDbConfigs.js";

const neverRead = () =>
	Promise.reject(new Error("readBody should not have been called"));

const bodyOf = (body: unknown) => () => Promise.resolve(body);

describe("resolveReplicaDbLane", () => {
	test("routes the customer list endpoints to the replica without reading the body", async () => {
		expect(
			await resolveReplicaDbLane({
				method: "POST",
				path: "/v1/customers/list",
				readBody: neverRead,
			}),
		).toBe("default");

		expect(
			await resolveReplicaDbLane({
				method: "POST",
				path: "/v1/customers.list",
				readBody: neverRead,
			}),
		).toBe("default");
	});

	test("routes unscoped entities.list to the replica", async () => {
		expect(
			await resolveReplicaDbLane({
				method: "POST",
				path: "/v1/entities.list",
				readBody: bodyOf({}),
			}),
		).toBe("default");

		expect(
			await resolveReplicaDbLane({
				method: "POST",
				path: "/v1/entities.list",
				readBody: bodyOf({ limit: 50, search: "acme" }),
			}),
		).toBe("default");
	});

	test("routes customer-scoped entities.list to the primary", async () => {
		expect(
			await resolveReplicaDbLane({
				method: "POST",
				path: "/v1/entities.list",
				readBody: bodyOf({ customer_id: "cus_123" }),
			}),
		).toBe(null);

		expect(
			await resolveReplicaDbLane({
				method: "POST",
				path: "/v1/entities.list",
				readBody: bodyOf({ customer_id: "cus_123", limit: 50 }),
			}),
		).toBe(null);
	});

	test("falls back to the primary when the body cannot be read", async () => {
		expect(
			await resolveReplicaDbLane({
				method: "POST",
				path: "/v1/entities.list",
				readBody: () =>
					Promise.reject(new SyntaxError("Unexpected end of JSON")),
			}),
		).toBe(null);
	});

	test("treats a blank or non-string customer_id as unscoped", async () => {
		for (const customerId of ["", "   ", 123, null]) {
			expect(
				await resolveReplicaDbLane({
					method: "POST",
					path: "/v1/entities.list",
					readBody: bodyOf({ customer_id: customerId }),
				}),
			).toBe("default");
		}
	});

	test("routes a non-object body to the replica", async () => {
		for (const body of [null, "customer", 42]) {
			expect(
				await resolveReplicaDbLane({
					method: "POST",
					path: "/v1/entities.list",
					readBody: bodyOf(body),
				}),
			).toBe("default");
		}
	});

	test("routes the migration filter preview to the slow lane without reading the body", async () => {
		expect(
			await resolveReplicaDbLane({
				method: "POST",
				path: "/migrations.filter.preview",
				readBody: neverRead,
			}),
		).toBe("slow");
	});

	test("does not match non-replica routes", async () => {
		expect(
			await resolveReplicaDbLane({
				method: "GET",
				path: "/v1/customers",
				readBody: neverRead,
			}),
		).toBe(null);

		expect(
			await resolveReplicaDbLane({
				method: "GET",
				path: "/v1/customers/cus_123",
				readBody: neverRead,
			}),
		).toBe(null);

		expect(
			await resolveReplicaDbLane({
				method: "POST",
				path: "/customers/all/search",
				readBody: neverRead,
			}),
		).toBe(null);
	});

	test("does not match entities.list on a different method", async () => {
		expect(
			await resolveReplicaDbLane({
				method: "GET",
				path: "/v1/entities.list",
				readBody: neverRead,
			}),
		).toBe(null);
	});
});
