import { readFileSync } from "node:fs";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { inspectWorkspaceConfig } from "./inspectConfig.ts";
import type { InspectedConfig } from "./types/inspectedConfig.ts";

/** The config file's text right now, or null if it doesn't exist yet. */
export const captureConfigText = (workspaceDir: string): string | null => {
	try {
		return readFileSync(join(workspaceDir, "autumn.config.ts"), "utf8");
	} catch {
		return null;
	}
};

/**
 * Inspects the config as it looked after each user turn, by replaying the
 * captured texts through the workspace. Identical texts are inspected once;
 * the file is restored to its final state afterwards.
 */
export const inspectConfigSnapshots = async ({
	workspaceDir,
	configTexts,
}: {
	workspaceDir: string;
	configTexts: (string | null)[];
}): Promise<InspectedConfig[]> => {
	if (configTexts.length === 0) return [];
	const configPath = join(workspaceDir, "autumn.config.ts");
	const finalText = captureConfigText(workspaceDir);

	const writeConfigText = async (text: string | null) => {
		if (text === null) await rm(configPath, { force: true });
		else await writeFile(configPath, text);
	};

	const inspectedByText = new Map<string | null, InspectedConfig>();
	const configs: InspectedConfig[] = [];
	for (const text of configTexts) {
		const cached = inspectedByText.get(text);
		if (cached) {
			configs.push(cached);
			continue;
		}
		await writeConfigText(text);
		const config = await inspectWorkspaceConfig(workspaceDir);
		inspectedByText.set(text, config);
		configs.push(config);
	}

	await writeConfigText(finalText);
	return configs;
};
