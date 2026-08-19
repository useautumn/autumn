/**
 * Contract for replica-vs-primary routing of list endpoints.
 *
 * Customers reported a read-after-write race: they create an entity, receive the
 * customer.products.updated webhook, call entities.list, and the entity is missing
 * because the request was served by a lagging read replica. Customer-scoped list
 * requests must therefore read the primary; unscoped org-wide enumeration (the
 * expensive query the replica routing exists to shed) stays on the replica.
 *
 * Contract under test:
 *   Behaviors:
 *     - POST /v1/customers/list          -> replica (default lane), body never read
 *     - POST /v1/customers.list          -> replica (default lane), body never read
 *     - POST /v1/entities.list, no customer_id -> replica (default lane)
 *     - POST /v1/entities.list, customer_id    -> primary
 *     - POST /v1/entities.list, unreadable body -> primary (fail safe)
 *     - POST /migrations.filter.preview  -> replica slow lane (long-query pool)
 *     - any non-listed route/method      -> primary
 *   Invariants:
 *     - The body is only read for routes whose decision depends on it.
 *     - A body that cannot be parsed never routes to the replica.
 */

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
		// The route schema is `z.string().trim().min(1).optional()`, so these are
		// rejected with a 400 before any query runs. Pinning the routing keeps the
		// decision aligned with what the schema considers a real scope.
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
