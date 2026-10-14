import { readFileSync, writeFileSync } from "node:fs";
import chalk from "chalk";
import { envPath } from "./updateEnvFile.js";

export function updateSingleEnvVar({
	key,
	value,
}: {
	key: string;
	value: string;
}) {
	try {
		const envContent = readFileSync(envPath, "utf-8");
		const lines = envContent.split("\n");

		let found = false;
		const updatedLines = lines.map((line) => {
			const trimmed = line.trim();
			if (trimmed.startsWith(`${key}=`)) {
				found = true;
				return `${key}=${value}`;
			}
			return line;
		});

		if (!found) {
			updatedLines.push(`${key}=${value}`);
		}

		writeFileSync(envPath, updatedLines.join("\n"));
		console.log(chalk.gray(`   ✓ Saved ${key} to .env`));
	} catch (error) {
		console.log(
			chalk.red(
				`   ⚠ Warning: Could not save ${key} to .env. You may need to add it manually.`,
			),
		);
	}
}

export function updateMultipleEnvVars(vars: Record<string, string>) {
	try {
		const envContent = readFileSync(envPath, "utf-8");
		const lines = envContent.split("\n");
		const keysToUpdate = Object.keys(vars);
		const foundKeys = new Set<string>();

		const updatedLines = lines.map((line) => {
			const trimmed = line.trim();
			for (const key of keysToUpdate) {
				if (trimmed.startsWith(`${key}=`)) {
					foundKeys.add(key);
					return `${key}=${vars[key]}`;
				}
			}
			return line;
		});

		for (const key of keysToUpdate) {
			if (!foundKeys.has(key)) {
				updatedLines.push(`${key}=${vars[key]}`);
			}
		}

		writeFileSync(envPath, updatedLines.join("\n"));

		for (const key of keysToUpdate) {
			console.log(chalk.gray(`   ✓ Saved ${key} to .env`));
		}
	} catch (error) {
		console.log(
			chalk.red(
				"   ⚠ Warning: Could not save variables to .env. You may need to add them manually.",
			),
		);
	}
}
