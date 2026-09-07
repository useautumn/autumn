import type { SgNode } from "@ast-grep/napi";
import { type FixtureConstraint, findFixture } from "../../surgery/findFixture";

/** The file, its source, the node, and the lookup that found it — reuse the
 * same lookup for the edit, or two versions sharing an id get confused. */
export type LocatedFixture = {
	file: string;
	source: string;
	node: SgNode;
	idField: string;
	id: string;
	where?: FixtureConstraint[];
};
export type { FixtureConstraint };

/**
 * Where a fixture literal lives: the config file first (the common case), then
 * every other walked source file. A stable id wins over the public one, so a
 * renamed row is still found; `where` narrows rows that share an id, like
 * plan versions. `files` maps absolute paths to their current source, so later
 * edits are seen by later lookups.
 */
export const locateFixture = ({
	configPath,
	files,
	builder,
	idField,
	id,
	internalId,
	where,
	allowDynamic = false,
}: {
	configPath: string;
	files: Map<string, string>;
	builder: string;
	idField: string;
	id: string;
	internalId?: string | null;
	where?: FixtureConstraint[];
	allowDynamic?: boolean;
}): LocatedFixture | null => {
	const others = [...files.keys()].filter((file) => file !== configPath);
	const ordered = [configPath, ...others];
	const attempts: {
		idField: string;
		id: string;
		where?: FixtureConstraint[];
	}[] = [
		...(typeof internalId === "string"
			? [{ idField: "internalId", id: internalId }]
			: []),
		{ idField, id, where },
	];
	for (const attempt of attempts) {
		for (const file of ordered) {
			const source = files.get(file);
			if (source === undefined) continue;
			const node = findFixture({ source, builder, allowDynamic, ...attempt });
			if (node !== null) return { file, source, node, ...attempt };
		}
	}
	return null;
};
