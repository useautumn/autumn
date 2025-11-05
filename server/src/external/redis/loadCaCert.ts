export const loadCaCert = async ({
	caPath,
	caEnvVar,
	type,
}: {
	caPath?: string;
	caEnvVar?: string;
	type: "queue" | "cache";
}) => {
	try {
		if (caEnvVar && process.env[caEnvVar]) {
			console.log(`loading ca from env var: ${caEnvVar}`);
			return process.env[caEnvVar];
		}

		const ca = Bun.file(caPath || `/etc/secrets/${type}.pem`);
		const caText = await ca.text();
		return caText;
	} catch (_error) {
		return;
	}
};
