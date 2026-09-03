import { readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Every `.ts` file under `directory`, recursively. Generated and scratch
 * directories are skipped: a pull must never rewrite its own inputs, and a
 * fixture literal inside `node_modules` or a `.tmp` folder is not the user's.
 */
export const listSourceFiles = ({
	directory,
}: {
	directory: string;
}): string[] => {
	const files: string[] = [];
	const walk = (dir: string): void => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const path = join(dir, entry.name);
			if (entry.isDirectory()) {
				if (entry.name === "node_modules" || entry.name.startsWith("."))
					continue;
				walk(path);
			} else if (entry.isFile() && entry.name.endsWith(".ts")) {
				files.push(path);
			}
		}
	};
	walk(directory);
	return files;
};
