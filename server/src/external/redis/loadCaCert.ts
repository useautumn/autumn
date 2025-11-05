export const loadCaCert = async ({
	caPath,
	type,
	caValue,
}: {
	caPath?: string;
	type: "queue" | "cache";
	caValue?: string;
}) => {
	try {
		if (caValue) {
			return caValue;
		}

		const ca = Bun.file(caPath || `/etc/secrets/${type}-cert.pem`);
		const caText = await ca.text();
		return caText;
	} catch (_error) {
		return;
	}
};
