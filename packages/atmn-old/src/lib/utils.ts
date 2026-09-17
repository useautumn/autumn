import fs from "node:fs";
import { confirm } from "@inquirer/prompts";
import chalk from "chalk";
import yoctoSpinner from "yocto-spinner";
import { isLocal, isProd } from "./env/cliContext.js";
import { AppEnv } from "./env/detect.js";
import { getKey } from "./env/keys.js";

export const notNullish = (value: unknown) =>
	value !== null && value !== undefined;
export const nullish = (value: unknown) =>
	value === null || value === undefined;

/**
 * @deprecated Use isProd() from cliContext.ts instead
 */
export const isProdFlag = () => {
	return isProd();
};

/**
 * @deprecated Use isLocal() from cliContext.ts instead
 */
export const isLocalFlag = () => {
	return isLocal();
};

export function snakeCaseToCamelCase(value: string) {
	return value.replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase());
}

export function idToVar({
	id,
	prefix = "product",
}: {
	id: string;
	prefix?: string;
}): string {
	const processed = id
		.replace(/[-_](.)/g, (_, letter) => letter.toUpperCase())
		.replace(/[^a-zA-Z0-9_$]/g, ""); // Remove invalid JavaScript identifier characters

	// If the processed string starts with a number, add 'product' prefix
	if (/^[0-9]/.test(processed)) {
		return `${prefix}${processed}`;
	}

	// If it starts with other invalid characters, add 'product' prefix
	if (/^[^a-zA-Z_$]/.test(processed)) {
		return `${prefix}${processed}`;
	}

	return processed;
}

async function upsertEnvVar(
	filePath: string,
	varName: string,
	newValue: string,
) {
	const content = fs.readFileSync(filePath, "utf-8");
	const lines = content.split("\n");
	let foundIndex = -1;

	// Find the first occurrence of the variable
	for (let i = 0; i < lines.length; i++) {
		if (lines[i]?.startsWith(`${varName}=`)) {
			foundIndex = i;
			break;
		}
	}

	if (foundIndex !== -1) {
		const shouldOverwrite = await confirm({
			message: `${varName} already exists in .env. Overwrite?`,
			default: false,
		});
		if (shouldOverwrite) {
			lines[foundIndex] = `${varName}=${newValue}`;
		}
	} else {
		// Variable wasn't found, add it to the end
		lines.push(`${varName}=${newValue}`);
	}

	// Write the updated content back to the file
	fs.writeFileSync(filePath, lines.join("\n"));
}

export async function storeToEnv(prodKey: string, sandboxKey: string) {
	const envPath = `${process.cwd()}/.env`;
	const envLocalPath = `${process.cwd()}/.env.local`;
	const envVars = `AUTUMN_PROD_SECRET_KEY=${prodKey}\nAUTUMN_SECRET_KEY=${sandboxKey}\n`;

	// Check if .env exists first
	if (fs.existsSync(envPath)) {
		await upsertEnvVar(envPath, "AUTUMN_PROD_SECRET_KEY", prodKey);
		await upsertEnvVar(envPath, "AUTUMN_SECRET_KEY", sandboxKey);
		console.log(chalk.green(".env file found. Updated keys."));
	} else if (fs.existsSync(envLocalPath)) {
		// If .env doesn't exist but .env.local does, create .env and write keys
		fs.writeFileSync(envPath, envVars);
		console.log(
			chalk.green(
				".env.local found but .env not found. Created new .env file and wrote keys.",
			),
		);
	} else {
		// Neither .env nor .env.local exists, create .env
		fs.writeFileSync(envPath, envVars);
		console.log(
			chalk.green(
				"No .env or .env.local file found. Created new .env file and wrote keys.",
			),
		);
	}
}

/**
 * Read API key from environment using centralized env resolution.
 * Precedence: process.env → .env.local → .env (via getKey/getDotenvValue)
 *
 * @deprecated Prefer using getKey(env) or getAnyKey() from lib/env directly.
 */
export function readFromEnv(options?: { bypass?: boolean }) {
	const env = isProd() ? AppEnv.Live : AppEnv.Sandbox;

	try {
		return getKey(env);
	} catch {
		if (!options?.bypass) {
			if (isProd()) {
				console.error(
					"[Error] atmn uses the AUTUMN_PROD_SECRET_KEY to call the Autumn production API. Please add it to your .env file or run `atmn login` to authenticate.",
				);
			} else {
				console.error(
					"[Error] atmn uses the AUTUMN_SECRET_KEY to call the Autumn sandbox API. Please add it to your .env (or .env.local) file or run `atmn login` to authenticate.",
				);
			}
			process.exit(1);
		}

		return undefined;
	}
}

export function initSpinner(message: string) {
	const spinner = yoctoSpinner({
		text: message,
	});
	spinner.start();

	return spinner;
}

export async function isSandboxKey(apiKey: string) {
	const prefix = apiKey.split("am_sk_")[1]?.split("_")[0];

	if (prefix === "live") {
		return false;
	} else if (prefix === "test") return true;
	else throw new Error("Invalid API key");
}
