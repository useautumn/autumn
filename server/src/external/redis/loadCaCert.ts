export const loadCaCert = async ({
	caPath,
	type,
}: {
	caPath?: string;
	type: "queue" | "cache";
}) => {
	try {
		const ca = Bun.file(caPath || `/etc/secrets/${type}.pem`);
		const caText = await ca.text();
		return caText;
	} catch (_error) {
		return;
	}
};
