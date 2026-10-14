import fs from "node:fs";
import path from "node:path";
import { resolveConfigPath } from "./env/index.js";

export function writeEmptyConfig(targetDir?: string): void {
	const content = `import { feature, item, plan } from 'atmn'
`;

	const configPath = targetDir
		? path.join(targetDir, "autumn.config.ts")
		: resolveConfigPath();
	fs.writeFileSync(configPath, content, "utf-8");
}
