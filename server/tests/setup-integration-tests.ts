import { execSync } from "node:child_process";
import { loadLocalEnv } from "../src/utils/envUtils.js";

// ... rest of your existing setup code

const loadInfisicalSecrets = async () => {
	// Load infisical secrets into process.env
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

console.log("--- Setup integration tests ---");
await loadInfisicalSecrets();
loadLocalEnv();
console.log("--- Setup integration tests complete ---");
