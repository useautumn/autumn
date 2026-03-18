import { readFileSync } from "node:fs";

const TINYBIRD_ROOT = new URL("../../../tinybird/", import.meta.url);

type PipeDatafile = {
	description?: string;
	nodes: Record<string, string>;
};

const trimIndentedBlock = (lines: string[]) =>
	lines
		.map((line) => {
			if (line.length === 0) {
				return line;
			}

			return line.startsWith("    ") ? line.slice(4) : line;
		})
		.join("\n")
		.trimEnd();

const readTinybirdFile = ({ relativePath }: { relativePath: string }) =>
	readFileSync(new URL(relativePath, TINYBIRD_ROOT), "utf8").replaceAll(
		"\r\n",
		"\n",
	);

const parsePipeDatafile = ({
	relativePath,
}: {
	relativePath: string;
}): PipeDatafile => {
	const content = readTinybirdFile({ relativePath });
	const lines = content.split("\n");

	const nodes: Record<string, string> = {};
	let description: string | undefined;
	let currentNode: string | null = null;

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index];

		if (line.startsWith("DESCRIPTION >") && description === undefined) {
			const block: string[] = [];
			index += 1;

			while (index < lines.length) {
				const blockLine = lines[index];

				if (blockLine.length > 0 && !blockLine.startsWith("    ")) {
					index -= 1;
					break;
				}

				block.push(blockLine);
				index += 1;
			}

			description = trimIndentedBlock(block);
			continue;
		}

		if (line.startsWith("NODE ")) {
			currentNode = line.slice("NODE ".length).trim();
			continue;
		}

		if (line.startsWith("SQL >")) {
			if (!currentNode) {
				throw new Error(`Found SQL block before NODE in ${relativePath}`);
			}

			const block: string[] = [];
			index += 1;

			while (index < lines.length) {
				const blockLine = lines[index];

				if (blockLine.length > 0 && !blockLine.startsWith("    ")) {
					index -= 1;
					break;
				}

				block.push(blockLine);
				index += 1;
			}

			nodes[currentNode] = trimIndentedBlock(block);
		}
	}

	return {
		description,
		nodes,
	};
};

const parseDatasourceDescription = ({
	relativePath,
}: {
	relativePath: string;
}) => {
	const content = readTinybirdFile({ relativePath });
	const lines = content.split("\n");
	const block: string[] = [];
	let inDescription = false;

	for (const line of lines) {
		if (!inDescription) {
			if (line.startsWith("DESCRIPTION >")) {
				inDescription = true;
			}

			continue;
		}

		if (line.length > 0 && !line.startsWith("    ")) {
			break;
		}

		block.push(line);
	}

	return trimIndentedBlock(block);
};

export const tinybirdDatasourceDefinitions = {
	events: {
		description: parseDatasourceDescription({
			relativePath: "datasources/events.datasource",
		}),
	},
} as const;

export const tinybirdPipeDefinitions = {
	aggregate: parsePipeDatafile({ relativePath: "pipes/aggregate.pipe" }),
	aggregateSimple: parsePipeDatafile({
		relativePath: "pipes/aggregate_simple.pipe",
	}),
	aggregateGroupable: parsePipeDatafile({
		relativePath: "pipes/aggregate_groupable.pipe",
	}),
	listEventNames: parsePipeDatafile({
		relativePath: "pipes/list_event_names.pipe",
	}),
	listEventsPaginated: parsePipeDatafile({
		relativePath: "pipes/list_events_paginated.pipe",
	}),
} as const;
