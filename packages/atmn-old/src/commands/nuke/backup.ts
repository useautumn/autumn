/**
 * Backup utilities for nuke command
 */

import fs from "node:fs";
import path from "node:path";

export interface BackupResult {
	created: boolean;
	path?: string;
	error?: string;
}

/**
 * Create backup of autumn.config.ts
 * @param cwd - Working directory (defaults to process.cwd())
 * @returns BackupResult with path or error
 */
export function createConfigBackup(cwd: string = process.cwd()): BackupResult {
	const configPath = path.join(cwd, "autumn.config.ts");
	const backupPath = path.join(cwd, "autumn.config.ts.backup");

	try {
		// Check if config exists
		if (!fs.existsSync(configPath)) {
			return {
				created: false,
				error: "autumn.config.ts not found",
			};
		}

		// Check if backup already exists
		if (fs.existsSync(backupPath)) {
			// Create timestamped backup instead
			const timestamp = new Date()
				.toISOString()
				.replace(/[:.]/g, "-")
				.slice(0, 19);
			const timestampedBackupPath = path.join(
				cwd,
				`autumn.config.ts.backup.${timestamp}`,
			);

			fs.copyFileSync(configPath, timestampedBackupPath);

			return {
				created: true,
				path: timestampedBackupPath,
			};
		}

		// Create backup
		fs.copyFileSync(configPath, backupPath);

		return {
			created: true,
			path: backupPath,
		};
	} catch (error) {
		return {
			created: false,
			error: error instanceof Error ? error.message : "Unknown error",
		};
	}
}

/**
 * Check if config file exists
 */
export function configExists(cwd: string = process.cwd()): boolean {
	const configPath = path.join(cwd, "autumn.config.ts");
	return fs.existsSync(configPath);
}
