import fs from "node:fs";
import path from "node:path";

export interface StoreEnvResult {
	envPath: string;
	created: boolean;
	keysWritten: string[];
}

export interface StoreEnvOptions {
	/** Force overwrite existing keys without prompting */
	forceOverwrite?: boolean;
	/** Working directory (defaults to process.cwd()) */
	cwd?: string;
}

/**
 * Store API keys to .env file
 * Non-interactive version for use in React/Ink components
 */
export async function storeEnvKeys(
	keys: { prodKey: string; sandboxKey: string },
	options?: StoreEnvOptions,
): Promise<StoreEnvResult> {
	const cwd = options?.cwd ?? process.cwd();
	const forceOverwrite = options?.forceOverwrite ?? true;

	const envPath = path.join(cwd, ".env");
	const _envLocalPath = path.join(cwd, ".env.local");

	const keysWritten: string[] = [];
	let created = false;

	const keyMap = {
		AUTUMN_PROD_SECRET_KEY: keys.prodKey,
		AUTUMN_SECRET_KEY: keys.sandboxKey,
	};

	// Check if .env exists
	if (fs.existsSync(envPath)) {
		// Read and update existing file
		const content = fs.readFileSync(envPath, "utf-8");
		const lines = content.split("\n");

		for (const [varName, value] of Object.entries(keyMap)) {
			const existingIndex = lines.findIndex((line) =>
				line.startsWith(`${varName}=`),
			);

			if (existingIndex !== -1) {
				if (forceOverwrite) {
					lines[existingIndex] = `${varName}=${value}`;
					keysWritten.push(varName);
				}
				// If not forceOverwrite, skip this key
			} else {
				// Key doesn't exist, add it
				lines.push(`${varName}=${value}`);
				keysWritten.push(varName);
			}
		}

		fs.writeFileSync(envPath, lines.join("\n"));
	} else {
		// Create new .env file
		created = true;
		const envContent = Object.entries(keyMap)
			.map(([key, value]) => `${key}=${value}`)
			.join("\n");

		fs.writeFileSync(envPath, `${envContent}\n`);
		keysWritten.push(...Object.keys(keyMap));
	}

	return {
		envPath,
		created,
		keysWritten,
	};
}
