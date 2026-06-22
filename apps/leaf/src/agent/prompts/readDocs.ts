import type { MCPClient } from "@mastra/mcp";

export const agentDocUris = [
	"autumn://docs/concepts",
	"autumn://docs/plan-management",
	"autumn://docs/billing",
	"autumn://docs/logs",
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
