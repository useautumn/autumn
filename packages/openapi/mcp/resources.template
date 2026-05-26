import type { ResourceDefinition } from "./resources.js";

const docs = [
	{
		name: "autumn_tools",
		resource: "autumn://docs/tools",
		description: "Autumn MCP tools and when to use each one.",
		text: [
			"# Autumn MCP tools",
			"",
			"- `list_customers`: list customers; use `search` to find a customer by ID, name, or email.",
			"- `get_customer`: fetch one customer by ID, optionally with expanded fields.",
			"- `list_plans`: list plans; optionally include customer eligibility.",
			"- `get_plan`: fetch one plan by ID and optional version.",
			"- `preview_attach`: preview the billing impact of attaching a plan. This does not modify billing state.",
			"- `attach`: attach a plan to a customer. Call `preview_attach` first and get explicit user confirmation.",
			"- `preview_update_subscription`: preview the billing impact of updating a subscription. This does not modify billing state.",
			"- `update_subscription`: update a subscription. Call `preview_update_subscription` first and get explicit user confirmation.",
		].join("\n"),
	},
	{
		name: "autumn_billing_workflows",
		resource: "autumn://docs/billing-workflows",
		description: "Preview-first billing workflow guidance.",
		text: [
			"# Billing workflows",
			"",
			"Use preview tools before write tools.",
			"",
			"1. For plan attachment, call `preview_attach` with the intended request.",
			"2. For subscription changes, call `preview_update_subscription` with the intended request.",
			"3. Show the user the relevant billing impact, including invoices, payment links, trials, prorations, cancellations, and plan changes when present.",
			"4. Ask for explicit confirmation before calling `attach` or `update_subscription`.",
			"5. Do not call a write tool if the user has not confirmed the exact billing action.",
		].join("\n"),
	},
	{
		name: "autumn_scopes",
		resource: "autumn://docs/scopes",
		description: "Autumn OAuth scopes used by this MCP server.",
		text: [
			"# Autumn MCP scopes",
			"",
			"- `customers:read`: `list_customers`, `get_customer`.",
			"- `plans:read`: `list_plans`, `get_plan`.",
			"- `billing:read`: `preview_attach`, `preview_update_subscription`.",
			"- `billing:write`: `attach`, `update_subscription`.",
		].join("\n"),
	},
] satisfies Array<
	Pick<ResourceDefinition, "name" | "resource" | "description"> & {
		text: string;
	}
>;

export function registerAutumnResources(register: {
	resource: (resource: ResourceDefinition) => void;
}) {
	for (const doc of docs) {
		register.resource({
			...doc,
			read: (client, uri) => {
				void client;
				return {
					contents: [
						{
							uri: uri.toString(),
							mimeType: "text/markdown",
							text: doc.text,
						},
					],
				};
			},
		});
	}
}
