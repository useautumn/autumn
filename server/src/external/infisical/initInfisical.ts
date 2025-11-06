import { InfisicalSDK } from "@infisical/sdk";

/**
 * Initialize Infisical and load secrets into process.env
 * This allows all existing code using process.env to work seamlessly
 */
export const initInfisical = async () => {
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
