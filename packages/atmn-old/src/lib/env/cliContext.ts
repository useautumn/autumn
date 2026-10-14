import { existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";

export interface CliContext {
	prod: boolean;
	local: boolean;
	configPath?: string;
}

let context: CliContext = {
	prod: false,
	local: false,
};

export function setCliContext(options: Partial<CliContext>): void {
	context = {
		prod: options.prod ?? false,
		local: options.local ?? false,
		configPath: options.configPath,
	};
}

export function getCliContext(): CliContext {
	return context;
}

export function isProd(): boolean {
	return context.prod;
}

export function isLocal(): boolean {
	return context.local;
}

export function resolveConfigPath(cwd: string = process.cwd()): string {
	if (context.configPath) {
		const resolved = resolve(cwd, context.configPath);

		if (existsSync(resolved) && statSync(resolved).isDirectory()) {
			return resolve(resolved, "autumn.config.ts");
		}

		const dir = resolved.endsWith(".ts") || resolved.endsWith(".js")
			? dirname(resolved)
			: resolved;
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true });
		}
		if (!resolved.endsWith(".ts") && !resolved.endsWith(".js")) {
			return resolve(resolved, "autumn.config.ts");
		}

		return resolved;
	}
	return resolve(cwd, "autumn.config.ts");
}
