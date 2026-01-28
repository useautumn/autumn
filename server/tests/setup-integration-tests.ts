import { loadLocalEnv } from "@/utils/envUtils";
import { execSync } from "node:child_process";
import { loadLocalEnv } from "@/utils/envUtils";

const isUnitTest = () => {
	return process.argv.some((arg) => arg.includes("unit"));
};

const loadInfisicalSecrets = async () => {
	try {
		const secrets = execSync("infisical export --env=dev --format=dotenv", {
			encoding: "utf-8",
		});

		for (const line of secrets.split("\n")) {
			const match = line.match(/^([^=]+)=(.*)$/);
			if (match) {
				process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
			}
		}
	} catch (e) {
		console.warn("Failed to load infisical secrets:", e);
	}
};

/**
 * Bun test preload script for integration tests.
 * Loads environment variables before any test file runs.
 */

if (isUnitTest()) {
	console.log("--- Skipping integration setup for unit tests ---");
} else {
	console.log("--- Setup integration tests ---");
	await loadInfisicalSecrets();
	loadLocalEnv();
	console.log("--- Setup integration tests complete ---");
}
