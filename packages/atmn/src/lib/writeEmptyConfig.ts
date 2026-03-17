import fs from "node:fs";
import path from "node:path";
import { resolveConfigPath } from "./env/index.js";

/**
 * Writes an empty/skeleton autumn.config.ts file to the specified directory or current working directory
 * @param targetDir - Optional directory to write the config file to. If not provided, uses resolveConfigPath()
 */
export function writeEmptyConfig(targetDir?: string): void {
	const content = `import { feature, item, plan } from 'atmn'
`;

	const configPath = targetDir
		? path.join(targetDir, "autumn.config.ts")
		: resolveConfigPath();
	fs.writeFileSync(configPath, content, "utf-8");
}
