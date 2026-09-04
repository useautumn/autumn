import type { SgNode } from "@ast-grep/napi";
import { findFixture } from "../../surgery/findFixture";

export type LocatedFixture = {
	file: string;
	source: string;
	node: SgNode;
};

/**
 * Where a fixture literal lives: the config file first (the common case), then
 * every other walked source file. `files` maps absolute paths to their current
 * source, so later edits are seen by later lookups.
 */
export const locateFixture = ({
	configPath,
	files,
	builder,
	idField,
	id,
}: {
	configPath: string;
	files: Map<string, string>;
	builder: string;
	idField: string;
	id: string;
}): LocatedFixture | null => {
	const others = [...files.keys()].filter((file) => file !== configPath);
	for (const file of [configPath, ...others]) {
		const source = files.get(file);
		if (source === undefined) continue;
		const node = findFixture({ source, builder, idField, id });
		if (node !== null) return { file, source, node };
	}
	return null;
};
