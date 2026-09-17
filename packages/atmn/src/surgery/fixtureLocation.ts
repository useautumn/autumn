import { readFileSync } from "node:fs";
import { dirname, relative } from "node:path";
import { listSourceFiles } from "../actions/pull/listSourceFiles";
import { locateFixture } from "../actions/pull/locateFixture";

/** The one place the CLI answers "where does this fixture live". */
export const fixtureLocation = ({
	configPath,
	builder,
	idField,
	id,
}: {
	configPath: string;
	builder: string;
	idField: string;
	id: string;
}): { file: string; line: number } | null => {
	const directory = dirname(configPath);
	const files = new Map<string, string>();
	files.set(configPath, readFileSync(configPath, "utf8"));
	for (const file of listSourceFiles({ directory })) {
		if (!files.has(file)) files.set(file, readFileSync(file, "utf8"));
	}

	const located = locateFixture({ configPath, files, builder, idField, id });
	if (located === null) return null;

	return {
		file: relative(directory, located.file),
		line: located.node.range().start.line + 1,
	};
};
