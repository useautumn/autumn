import type { McpFormat } from "../../config/types.js";
import type { McpResource } from "./types.js";

/**
 * Build an MCP resource from a composed body. The `# Title` + body shape
 * mirrors the legacy resources-v2 compiler for byte-parity.
 */
export const toMcpResource = ({
	title,
	description,
	format,
	body,
	ownTitle,
}: {
	title: string;
	description: string;
	format: McpFormat;
	body: string;
	/** True when the body already carries its own `# Title` (template mode). */
	ownTitle: boolean;
}): McpResource => ({
	name: format.uri,
	title,
	description,
	priority: format.priority,
	audience: ["assistant"],
	uri: `autumn://docs/${format.uri}`,
	text: ownTitle ? body : [`# ${title}`, body].join("\n\n"),
});
