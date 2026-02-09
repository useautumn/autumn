import { InfisicalSDK } from "@infisical/sdk";
import { loadLocalEnv } from "@/utils/envUtils.js";
import { mask } from "@/utils/genUtils";
/**
 * Initialize Infisical and load secrets into process.env
 * This allows all existing code using process.env to work seamlessly
 */
export const initInfisical = async (params?: { secretPath?: string }) => {
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
			secretPath: params?.secretPath,
			includeImports: true,
			recursive: true,
		});

		// Load secrets into process.env
		// Note: Existing process.env variables take precedence (won't be overridden)
		let loadedCount = 0;

		for (const secret of allSecrets.secrets) {
			// If path is restricted log that we're seeing it
			if (secret.secretPath?.includes("restricted") && secret.secretValue) {
				console.log(
					`Retrieving restricted secret: ${secret.secretKey}, Path: ${secret.secretPath}, value: ${mask(secret.secretValue, 3, 2)}`,
				);
			}
			if (!process.env[secret.secretKey]) {
				process.env[secret.secretKey] = secret.secretValue;
				loadedCount++;
			}
		}

		for (const importSecrets of allSecrets?.imports ?? []) {
			for (const importSecret of importSecrets.secrets) {
				if (!process.env[importSecret.secretKey]) {
					process.env[importSecret.secretKey] = importSecret.secretValue;
					loadedCount++;
				}
			}
		}

		console.log(`✅ Infisical: loaded ${loadedCount} secrets into process.env`);
	} catch (error) {
		console.error("❌ Failed to initialize Infisical:", error);
		throw error;
	}
};
