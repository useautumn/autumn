import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createJiti } from "jiti";
import type { Feature, Plan } from "../../compose/index.js";
import { resolveConfigPath } from "../../lib/env/cliContext.js";

export interface LoadedConfig {
	plans: Plan[];
	features: Feature[];
}

export const loadConfig = async ({
	cwd = process.cwd(),
}: {
	cwd?: string;
}): Promise<LoadedConfig> => {
	// Use resolveConfigPath which respects global --config flag
	const configPath = resolveConfigPath(cwd);

	if (!existsSync(configPath)) {
		throw new Error(
			`Config file not found: ${configPath}\n` +
				"Create an autumn.config.ts file or specify a path with --config",
		);
	}

	const absolutePath = resolve(configPath);
	const fileUrl = pathToFileURL(absolutePath).href;

	// Use jiti to load TypeScript config
	const jiti = createJiti(import.meta.url);
	const mod = await jiti.import(fileUrl);

	const plans: Plan[] = [];
	const features: Feature[] = [];

	// Check for old-style default export first
	const modRecord = mod as { default?: unknown } & Record<string, unknown>;
	const defaultExport = modRecord.default as
		| {
				plans?: Plan[];
				features?: Feature[];
				products?: Plan[];
		  }
		| undefined;

	if (defaultExport?.plans && defaultExport?.features) {
		if (Array.isArray(defaultExport.plans)) {
			plans.push(...defaultExport.plans);
		}
		if (Array.isArray(defaultExport.features)) {
			features.push(...defaultExport.features);
		}
	} else if (defaultExport?.products && defaultExport?.features) {
		// Legacy format
		if (Array.isArray(defaultExport.products)) {
			plans.push(...defaultExport.products);
		}
		if (Array.isArray(defaultExport.features)) {
			features.push(...defaultExport.features);
		}
	} else {
		// New format: individual named exports
		for (const [key, value] of Object.entries(modRecord)) {
			if (key === "default") continue;

			const obj = value as { items?: unknown; type?: unknown; id?: string };
			// Detect if it's a plan (has items array or id+name without type) or feature (has type)
			if (obj && typeof obj === "object") {
				if ("type" in obj) {
					// Has type field = feature
					features.push(obj as unknown as Feature);
				} else if (Array.isArray(obj.items) || "id" in obj) {
					// Has items array (or id without type) = plan
					plans.push(obj as unknown as Plan);
				}
			}
		}
	}

	return { features, plans };
};
