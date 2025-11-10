import { join } from "node:path";
import { InfisicalSDK } from "@infisical/sdk";
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

/**
 * Initialize Infisical and load secrets into process.env
 * This allows all existing code using process.env to work seamlessly
 */
export const initInfisical = async () => {
	loadLocalEnv();

	// Only initialize if credentials are provided
	const clientId = process.env.INFISICAL_CLIENT_ID;
	const clientSecret = process.env.INFISICAL_CLIENT_SECRET;
	const projectId = process.env.INFISICAL_PROJECT_ID;
	const environment = process.env.INFISICAL_ENVIRONMENT;

	if (!clientId || !clientSecret || !projectId || !environment) {
		console.log("⚠️  Infisical credentials not found - skipping initialization");
		return;
	}

	try {
		const client = new InfisicalSDK();

		// Authenticate using Universal Auth
		await client.auth().universalAuth.login({
			clientId,
			clientSecret,
		});

		// Fetch all secrets from the specified environment
		const allSecrets = await client.secrets().listSecrets({
			environment,
			projectId,
		});

		// Load secrets into process.env
		// Note: Existing process.env variables take precedence (won't be overridden)
		let loadedCount = 0;

		for (const secret of allSecrets.secrets) {
			if (!process.env[secret.secretKey]) {
				process.env[secret.secretKey] = secret.secretValue;
				loadedCount++;
			}
		}

		console.log(`✅ Infisical: loaded ${loadedCount} secrets into process.env`);
	} catch (error) {
		console.error("❌ Failed to initialize Infisical:", error);
		throw error;
	}
};
