import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Project ref from trigger.config.ts (avoid importing the full config). */
export function readTriggerProjectRef({
	projectRoot,
}: {
	projectRoot: string;
}): string {
	const configPath = join(projectRoot, "trigger.config.ts");
	if (!existsSync(configPath)) {
		throw new Error(`Missing ${configPath}`);
	}
	const source = readFileSync(configPath, "utf-8");
	const match = source.match(/project:\s*["']([^"']+)["']/);
	if (!match?.[1]) {
		throw new Error(`Could not parse project ref from ${configPath}`);
	}
	return match[1];
}
