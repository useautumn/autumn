import { describe, expect, test } from "bun:test";
import { diffOpenApiOperations } from "./diffOpenApiOperations";
import { buildReleaseImpact } from "./releaseImpact";

const spec = ({
	paths,
	schemas = {},
}: {
	paths: Record<string, Record<string, unknown>>;
	schemas?: Record<string, unknown>;
}) => ({ paths, components: { schemas } });

const customerOp = {
	operationId: "getCustomer",
	tags: ["customers"],
	responses: {
		200: {
			content: {
				"application/json": {
					schema: { $ref: "#/components/schemas/Customer" },
				},
			},
		},
	},
};

describe("diffOpenApiOperations", () => {
	test("detects added and removed operations by method and path", () => {
		const diff = diffOpenApiOperations({
			base: spec({ paths: { "/v1/billing.advance": { post: {} } } }),
			head: spec({ paths: { "/v1/customers.advance": { post: {} } } }),
		});
		expect(diff.added.map((op) => op.key)).toEqual([
			"POST /v1/customers.advance",
		]);
		expect(diff.removed.map((op) => op.key)).toEqual([
			"POST /v1/billing.advance",
		]);
		expect(diff.changed).toEqual([]);
	});

	test("flags an operation as changed when a referenced schema changes", () => {
		const paths = { "/v1/customers.get": { post: customerOp } };
		const diff = diffOpenApiOperations({
			base: spec({ paths, schemas: { Customer: { type: "object" } } }),
			head: spec({
				paths,
				schemas: {
					Customer: { type: "object", properties: { id: { type: "string" } } },
				},
			}),
		});
		expect(diff.changed.map((op) => op.key)).toEqual([
			"POST /v1/customers.get",
		]);
	});

	test("ignores key ordering and survives recursive schemas", () => {
		const recursive = {
			type: "object",
			properties: { parent: { $ref: "#/components/schemas/Customer" } },
		};
		const diff = diffOpenApiOperations({
			base: spec({
				paths: { "/v1/customers.get": { post: customerOp } },
				schemas: { Customer: recursive },
			}),
			head: spec({
				paths: {
					"/v1/customers.get": {
						post: { responses: customerOp.responses, ...customerOp },
					},
				},
				schemas: { Customer: recursive },
			}),
		});
		expect(diff).toEqual({ added: [], removed: [], changed: [] });
	});
});

describe("buildReleaseImpact", () => {
	const emptyDiff = { added: [], removed: [], changed: [] };

	test("public API changes affect autumn-js, atmn and docs but not gateway", () => {
		const impact = buildReleaseImpact({
			baseSha: "a",
			headSha: "b",
			changedFiles: ["server/src/index.ts"],
			publicDiff: diffOpenApiOperations({
				base: spec({ paths: {} }),
				head: spec({ paths: { "/v1/customers.get": { post: customerOp } } }),
			}),
			internalDiff: emptyDiff,
		});
		expect(impact.targets["autumn-js"].affected).toBe(true);
		expect(impact.targets.atmn.affected).toBe(true);
		expect(impact.targets.docs.affected).toBe(true);
		expect(impact.targets.gateway.affected).toBe(false);
		expect(impact.operations.public.added[0]?.docsPage).toBe(
			"api-reference/customers/getCustomer",
		);
	});

	test("internal-only changes affect atmn only", () => {
		const impact = buildReleaseImpact({
			baseSha: "a",
			headSha: "b",
			changedFiles: [],
			publicDiff: emptyDiff,
			internalDiff: diffOpenApiOperations({
				base: spec({ paths: {} }),
				head: spec({ paths: { "/v1/internal.x": { post: {} } } }),
			}),
		});
		expect(impact.targets.atmn.affected).toBe(true);
		expect(impact.targets["autumn-js"].affected).toBe(false);
		expect(impact.targets.docs.affected).toBe(false);
	});

	test("direct file changes affect only the touched target", () => {
		const impact = buildReleaseImpact({
			baseSha: "a",
			headSha: "b",
			changedFiles: ["packages/gateway/src/index.ts"],
			publicDiff: emptyDiff,
			internalDiff: emptyDiff,
		});
		expect(impact.targets.gateway.affected).toBe(true);
		expect(impact.targets.gateway.touchedFiles).toEqual([
			"packages/gateway/src/index.ts",
		]);
		expect(impact.targets.atmn.affected).toBe(false);
	});
});
