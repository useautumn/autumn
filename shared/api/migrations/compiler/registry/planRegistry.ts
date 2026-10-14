import type { RootScope } from "./registryTypes.js";

export const planRegistry: RootScope = {
	from: "products p",
	ambient: [
		{ column: "p.org_id", source: { kind: "context", key: "orgId" } },
		{ column: "p.env", source: { kind: "context", key: "env" } },
	],
	fields: {
		plan_id: { kind: "leaf", sql: "p.id" },
		version: { kind: "leaf", sql: "p.version" },
		addon: { kind: "leaf", sql: "p.is_add_on" },
	},
};
