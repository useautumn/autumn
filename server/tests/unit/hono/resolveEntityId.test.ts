import { describe, expect, test } from "bun:test";
import { resolveEntityId } from "@/honoMiddlewares/utils/resolveEntityId.js";

describe("resolveEntityId", () => {
	test("resolves entity id from path params", () => {
		const entityId = resolveEntityId({
			method: "DELETE",
			path: "/v1/customers/cus_123/entities/ent_123",
		});

		expect(entityId).toBe("ent_123");
	});

	test("resolves entity id from body", () => {
		const entityId = resolveEntityId({
			method: "POST",
			path: "/v1/entities.create",
			body: {
				entity_id: "ent_body",
			},
		});

		expect(entityId).toBe("ent_body");
	});

	test("resolves legacy create entity body id", () => {
		const entityId = resolveEntityId({
			method: "POST",
			path: "/v1/customers/cus_123/entities",
			body: {
				id: "ent_legacy",
			},
		});

		expect(entityId).toBe("ent_legacy");
	});

	test("does not resolve multi-create entity array as one entity id", () => {
		const entityId = resolveEntityId({
			method: "POST",
			path: "/v1/customers/cus_123/entities",
			body: [{ id: "ent_1" }, { id: "ent_2" }],
		});

		expect(entityId).toBeUndefined();
	});

	test("resolves entity id from query", () => {
		const entityId = resolveEntityId({
			method: "GET",
			path: "/v1/events/list",
			query: {
				entity_id: "ent_query",
			},
		});

		expect(entityId).toBe("ent_query");
	});

	test("does not resolve transfer-style entity fields", () => {
		const entityId = resolveEntityId({
			method: "POST",
			path: "/v1/customers/cus_123/transfer",
			body: {
				from_entity_id: "ent_from",
				to_entity_id: "ent_to",
			},
		});

		expect(entityId).toBeUndefined();
	});
});
