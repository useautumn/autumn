import fs from "node:fs";
import path from "node:path";

export interface BackupResult {
	created: boolean;
	path?: string;
	error?: string;
}

export function createConfigBackup(cwd: string = process.cwd()): BackupResult {
	const configPath = path.join(cwd, "autumn.config.ts");
	const backupPath = path.join(cwd, "autumn.config.ts.backup");

	try {
		if (!fs.existsSync(configPath)) {
			return {
				created: false,
				error: "autumn.config.ts not found",
			};
		}

		if (fs.existsSync(backupPath)) {
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

export function configExists(cwd: string = process.cwd()): boolean {
	const configPath = path.join(cwd, "autumn.config.ts");
	return fs.existsSync(configPath);
}
