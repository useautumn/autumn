import type { Source } from "../config/types.js";

export const composeSources = ({
	sources,
	readSource,
}: {
	sources: Source[];
	readSource: (source: Source) => string;
}): string => sources.map((source) => readSource(source).trim()).join("\n\n");
