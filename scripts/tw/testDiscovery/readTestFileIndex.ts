import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

export const readTestFileIndex = async ({ rootDir }: { rootDir: string }) => {
	const files: string[] = [];
	const directories: string[] = [];
	const walk = async (directory: string): Promise<void> => {
		directories.push(directory);
		const entries = await readdir(directory, { withFileTypes: true });
		for (const entry of entries) {
			const path = join(directory, entry.name);
			const kind = entry.isSymbolicLink() ? await stat(path) : entry;
			if (kind.isDirectory()) await walk(path);
			else if (entry.name.endsWith(".test.ts")) files.push(path);
		}
	};
	await walk(rootDir);
	return { files, directories };
};
