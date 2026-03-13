import fs from "node:fs";
import path from "node:path";
import { useMutation } from "@tanstack/react-query";
import { templateConfigs } from "../constants/templates/index.js";
import { resolveConfigPath } from "../env/index.js";
import { buildConfigFile } from "../transforms/sdkToCode/configFile.js";

interface WriteTemplateConfigParams {
	template: string;
	cwd?: string;
}

interface WriteTemplateConfigResult {
	configPath: string;
	template: string;
}

/**
 * Hook to write a template config file to autumn.config.ts
 * Uses useMutation for the one-time write operation
 */
export function useWriteTemplateConfig() {
	return useMutation({
		mutationFn: async (
			params: WriteTemplateConfigParams,
		): Promise<WriteTemplateConfigResult> => {
			const { template, cwd } = params;

			const config = templateConfigs[template];
			if (!config) {
				throw new Error(`Unknown template: ${template}`);
			}

			// Generate the config file content
			const configContent = buildConfigFile(config.features, config.plans);

			// Write to config file
			// If cwd is provided, use it directly; otherwise respect --config flag via resolveConfigPath
			const configPath = cwd
				? path.resolve(cwd, "autumn.config.ts")
				: resolveConfigPath();
			fs.writeFileSync(configPath, configContent, "utf-8");

			return {
				configPath,
				template,
			};
		},
	});
}
