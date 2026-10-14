import type { McpFormat } from "../../config/types.js";
import type { McpResource } from "./types.js";

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
