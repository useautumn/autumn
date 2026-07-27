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
 *     - POST /v1/customers/list          -> replica, body never read
 *     - POST /v1/customers.list          -> replica, body never read
 *     - POST /v1/entities.list, no customer_id -> replica
 *     - POST /v1/entities.list, customer_id    -> primary
 *     - POST /v1/entities.list, unreadable body -> primary (fail safe)
 *     - any non-listed route/method      -> primary
 *   Invariants:
 *     - The body is only read for routes whose decision depends on it.
 *     - A body that cannot be parsed never routes to the replica.
 */

import { describe, expect, test } from "bun:test";
import { shouldUseReplicaDb } from "@/internal/misc/replicaDb/replicaDbConfigs.js";

const neverRead = () =>
	Promise.reject(new Error("readBody should not have been called"));

const bodyOf = (body: unknown) => () => Promise.resolve(body);

describe("shouldUseReplicaDb", () => {
	test("routes the customer list endpoints to the replica without reading the body", async () => {
		expect(
			await shouldUseReplicaDb({
				method: "POST",
				path: "/v1/customers/list",
				readBody: neverRead,
			}),
		).toBe(true);

		expect(
			await shouldUseReplicaDb({
				method: "POST",
				path: "/v1/customers.list",
				readBody: neverRead,
			}),
		).toBe(true);
	});

	test("routes unscoped entities.list to the replica", async () => {
		expect(
			await shouldUseReplicaDb({
				method: "POST",
				path: "/v1/entities.list",
				readBody: bodyOf({}),
			}),
		).toBe(true);

		expect(
			await shouldUseReplicaDb({
				method: "POST",
				path: "/v1/entities.list",
				readBody: bodyOf({ limit: 50, search: "acme" }),
			}),
		).toBe(true);
	});

	test("routes customer-scoped entities.list to the primary", async () => {
		expect(
			await shouldUseReplicaDb({
				method: "POST",
				path: "/v1/entities.list",
				readBody: bodyOf({ customer_id: "cus_123" }),
			}),
		).toBe(false);

		expect(
			await shouldUseReplicaDb({
				method: "POST",
				path: "/v1/entities.list",
				readBody: bodyOf({ customer_id: "cus_123", limit: 50 }),
			}),
		).toBe(false);
	});

	test("falls back to the primary when the body cannot be read", async () => {
		expect(
			await shouldUseReplicaDb({
				method: "POST",
				path: "/v1/entities.list",
				readBody: () =>
					Promise.reject(new SyntaxError("Unexpected end of JSON")),
			}),
		).toBe(false);
	});

	test("treats a blank or non-string customer_id as unscoped", async () => {
		// The route schema is `z.string().trim().min(1).optional()`, so these are
		// rejected with a 400 before any query runs. Pinning the routing keeps the
		// decision aligned with what the schema considers a real scope.
		for (const customerId of ["", "   ", 123, null]) {
			expect(
				await shouldUseReplicaDb({
					method: "POST",
					path: "/v1/entities.list",
					readBody: bodyOf({ customer_id: customerId }),
				}),
			).toBe(true);
		}
	});

	test("routes a non-object body to the replica", async () => {
		for (const body of [null, "customer", 42]) {
			expect(
				await shouldUseReplicaDb({
					method: "POST",
					path: "/v1/entities.list",
					readBody: bodyOf(body),
				}),
			).toBe(true);
		}
	});

	test("does not match non-replica routes", async () => {
		expect(
			await shouldUseReplicaDb({
				method: "GET",
				path: "/v1/customers",
				readBody: neverRead,
			}),
		).toBe(false);

		expect(
			await shouldUseReplicaDb({
				method: "GET",
				path: "/v1/customers/cus_123",
				readBody: neverRead,
			}),
		).toBe(false);

		expect(
			await shouldUseReplicaDb({
				method: "POST",
				path: "/customers/all/search",
				readBody: neverRead,
			}),
		).toBe(false);
	});

	test("does not match entities.list on a different method", async () => {
		expect(
			await shouldUseReplicaDb({
				method: "GET",
				path: "/v1/entities.list",
				readBody: neverRead,
			}),
		).toBe(false);
	});
});
