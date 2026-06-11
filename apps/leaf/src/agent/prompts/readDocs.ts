import type { MCPClient } from "@mastra/mcp";

export const agentDocUris = [
	"autumn://docs/tool-composition",
	"autumn://docs/feature-catalog",
	"autumn://docs/querying-plans",
	"autumn://docs/querying-customers",
	"autumn://docs/billing-safety",
	"autumn://docs/schedules",
	"autumn://docs/balances",
	"autumn://docs/request-logs",
	"autumn://docs/request-log-customers",
	"autumn://docs/request-log-balances",
	"autumn://docs/request-log-billing",
	"autumn://docs/request-log-stripe-webhooks",
	"autumn://docs/request-log-analytics",
];

export const readDocs = async ({ mcp }: { mcp: MCPClient }) => {
	const resources = await Promise.allSettled(
		agentDocUris.map((uri) => mcp.resources.read("autumn", uri)),
	);
	return resources
		.flatMap((result) =>
			result.status === "fulfilled"
				? result.value.contents.flatMap((content) =>
						"text" in content ? [content.text] : [],
					)
				: [],
		)
		.join("\n\n");
};
