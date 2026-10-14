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

			const configContent = buildConfigFile(config.features, config.plans);

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
