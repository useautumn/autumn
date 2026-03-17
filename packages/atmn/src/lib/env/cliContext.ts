/**
 * Global CLI context for storing parsed options
 * This avoids relying on process.argv parsing which doesn't handle combined flags like -lp
 */

import { existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";

export interface CliContext {
	prod: boolean;
	local: boolean;
	/** Explicit config file path (relative to cwd or absolute) */
	configPath?: string;
}

let context: CliContext = {
	prod: false,
	local: false,
};

/**
 * Set the CLI context from parsed commander options
 * Should be called once at CLI startup before any commands run
 */
export function setCliContext(options: Partial<CliContext>): void {
	context = {
		prod: options.prod ?? false,
		local: options.local ?? false,
		configPath: options.configPath,
	};
}

/**
 * Get the current CLI context
 */
export function getCliContext(): CliContext {
	return context;
}

/**
 * Check if production mode is enabled
 */
export function isProd(): boolean {
	return context.prod;
}

/**
 * Check if local mode is enabled
 */
export function isLocal(): boolean {
	return context.local;
}

/**
 * Resolve the config file path
 * If --config was provided, use that (resolved relative to cwd)
 * If --config points to a directory, append autumn.config.ts
 * Otherwise, default to autumn.config.ts in cwd
 */
export function resolveConfigPath(cwd: string = process.cwd()): string {
	if (context.configPath) {
		const resolved = resolve(cwd, context.configPath);

		// If path exists and is a directory, append autumn.config.ts
		if (existsSync(resolved) && statSync(resolved).isDirectory()) {
			return resolve(resolved, "autumn.config.ts");
		}

		// Auto-create parent directories if they don't exist
		const dir = resolved.endsWith(".ts") || resolved.endsWith(".js")
			? dirname(resolved)
			: resolved;
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true });
		}
		// If path doesn't look like a file, treat as directory
		if (!resolved.endsWith(".ts") && !resolved.endsWith(".js")) {
			return resolve(resolved, "autumn.config.ts");
		}

		return resolved;
	}
	return resolve(cwd, "autumn.config.ts");
}
