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
		if (caEnvVar) {
			return caEnvVar;
			// // Handle escaped newlines - Railway and other platforms often store
			// // certificates with literal \n strings instead of actual newlines
			// const processedCert = certContent.replace(/\\n/g, "\n");

			// return processedCert;
		}

		const ca = Bun.file(caPath || `/etc/secrets/${type}.pem`);
		const caText = await ca.text();
		return caText;
	} catch (_error) {
		return;
	}
};
