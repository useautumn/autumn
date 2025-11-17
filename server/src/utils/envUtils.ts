import { join } from "node:path";
import { config } from "dotenv";

export const loadLocalEnv = () => {
	const processDir = process.cwd();
	const serverDir = processDir.includes("server")
		? processDir
		: join(processDir, "server");

	// Determine which env file to load based on ENV_FILE environment variable
	// Defaults to .env if not specified
	const envFileName = process.env.ENV_FILE || ".env";
	const envPath = join(serverDir, envFileName);

	// Load local .env file FIRST - these will take precedence over Infisical
	const result = config({ path: envPath });
	if (result.parsed) {
		console.log(
			`📄 Loading ${Object.keys(result.parsed).length} variables from ${envFileName}`,
		);
		for (const [key, value] of Object.entries(result.parsed)) {
			process.env[key] = value;
		}
	} else {
		console.log(
			`ℹ️  No ${envFileName} file found (using only Infisical secrets)`,
		);
	}
};
