import { join, normalize, sep } from "node:path";
import { readTestFileIndex } from "./readTestFileIndex";

export const createTestFileResolver = async ({
	rootDir,
}: {
	rootDir: string;
}) => {
	const { files, directories } = await readTestFileIndex({ rootDir });
	const exactFiles = new Set(files);
	const exactDirectories = new Set(directories);
	const filesWithin = (directory: string) =>
		files.filter((file) => file.startsWith(`${directory}${sep}`));
	const resolvePath = ({ path }: { path: string }): string[] => {
		const exactPath = normalize(join(rootDir, path)).replace(/\/$/, "");
		if (exactFiles.has(exactPath)) return [exactPath];
		if (exactDirectories.has(exactPath)) return filesWithin(exactPath);

		// Preserve the existing depth-first suffix match for paths that omit "integration/".
		const suffix = `${sep}${path}`;
		if (path.endsWith(".test.ts")) {
			const file = files.find((file) => file.endsWith(suffix));
			return file ? [file] : [];
		}
		const directory = directories.find(
			(directory) => directory !== rootDir && directory.endsWith(suffix),
		);
		return directory ? filesWithin(directory) : [];
	};
	return { resolvePath };
};
