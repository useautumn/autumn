import { readFileSync } from "node:fs";
import { type ScopeString, Scopes } from "@autumn/shared/scopeDefinitions";
import yaml from "yaml";
import { resolvePaths } from "../utils/paths.js";

const EXPECTED = new Map([
	[
		"listCustomers",
		{
			name: "list_customers",
			autumnScopes: [Scopes.Customers.Read],
			readOnlyHint: true,
			destructiveHint: false,
		},
	],
	[
		"getCustomer",
		{
			name: "get_customer",
			autumnScopes: [Scopes.Customers.Read],
			readOnlyHint: true,
			destructiveHint: false,
		},
	],
	[
		"listPlans",
		{
			name: "list_plans",
			autumnScopes: [Scopes.Plans.Read],
			readOnlyHint: true,
			destructiveHint: false,
		},
	],
	[
		"getPlan",
		{
			name: "get_plan",
			autumnScopes: [Scopes.Plans.Read],
			readOnlyHint: true,
			destructiveHint: false,
		},
	],
	[
		"previewAttach",
		{
			name: "preview_attach",
			autumnScopes: [Scopes.Billing.Read],
			readOnlyHint: true,
			destructiveHint: false,
		},
	],
	[
		"attach",
		{
			name: "attach",
			autumnScopes: [Scopes.Billing.Write],
			readOnlyHint: false,
			destructiveHint: true,
		},
	],
	[
		"previewUpdate",
		{
			name: "preview_update_subscription",
			autumnScopes: [Scopes.Billing.Read],
			readOnlyHint: true,
			destructiveHint: false,
		},
	],
	[
		"billingUpdate",
		{
			name: "update_subscription",
			autumnScopes: [Scopes.Billing.Write],
			readOnlyHint: false,
			destructiveHint: true,
		},
	],
] as const satisfies readonly [
	string,
	{
		readonly name: string;
		readonly autumnScopes: readonly ScopeString[];
		readonly readOnlyHint: boolean;
		readonly destructiveHint: boolean;
	},
][]);

const paths = resolvePaths();
const spec = yaml.parse(readFileSync(paths.openApiMcpOutput, "utf8")) as {
	paths?: Record<string, Record<string, Record<string, unknown>>>;
};

const operations = new Map<string, Record<string, unknown>>();

for (const methods of Object.values(spec.paths ?? {})) {
	for (const operation of Object.values(methods)) {
		const operationId = operation.operationId;
		if (typeof operationId === "string") {
			operations.set(operationId, operation);
		}
	}
}

const expectedIds = [...EXPECTED.keys()].sort();
const actualIds = [...operations.keys()].sort();
if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) {
	throw new Error(
		`Unexpected MCP operation IDs.\nExpected: ${expectedIds.join(", ")}\nActual:   ${actualIds.join(", ")}`,
	);
}

for (const [operationId, expected] of EXPECTED) {
	const operation = operations.get(operationId);
	const mcp = operation?.["x-speakeasy-mcp"] as
		| Record<string, unknown>
		| undefined;
	const autumnScopes = operation?.["x-autumn-scopes"];

	if (!mcp) {
		throw new Error(`${operationId} is missing x-speakeasy-mcp metadata`);
	}

	for (const [key, value] of Object.entries(expected)) {
		if (key === "autumnScopes") {
			if (JSON.stringify(autumnScopes) !== JSON.stringify(value)) {
				throw new Error(
					`${operationId} expected x-autumn-scopes=${JSON.stringify(value)}, got ${JSON.stringify(autumnScopes)}`,
				);
			}
			continue;
		}

		if (JSON.stringify(mcp[key]) !== JSON.stringify(value)) {
			throw new Error(
				`${operationId} expected x-speakeasy-mcp.${key}=${JSON.stringify(value)}, got ${JSON.stringify(mcp[key])}`,
			);
		}
	}
}

console.log(`Validated ${paths.openApiMcpOutput}`);
