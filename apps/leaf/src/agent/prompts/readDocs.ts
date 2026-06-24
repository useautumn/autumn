import { agentDocBundleUris } from "@autumn/agent-docs/agent";
import type { MCPClient } from "@mastra/mcp";

export const readDocs = async ({ mcp }: { mcp: MCPClient }) => {
	const resources = await Promise.allSettled(
		agentDocBundleUris.map((uri) => mcp.resources.read("autumn", uri)),
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
