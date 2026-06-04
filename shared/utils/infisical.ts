export const initInfisical = async () => {
	const clientId = process.env.INFISICAL_CLIENT_ID;
	const clientSecret = process.env.INFISICAL_CLIENT_SECRET;
	const projectId = process.env.INFISICAL_PROJECT_ID;
	const environment = process.env.INFISICAL_ENVIRONMENT;
	if (!clientId || !clientSecret || !projectId || !environment) return;

	const auth = await fetch("https://app.infisical.com/api/v1/auth/universal-auth/login", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ clientId, clientSecret }),
	});
	if (!auth.ok) throw new Error(`Infisical auth failed: ${auth.status}`);
	const { accessToken } = (await auth.json()) as { accessToken: string };

	const params = new URLSearchParams({
		environment,
		workspaceId: projectId,
		secretPath: process.env.INFISICAL_SECRET_PATH ?? "/",
		includeImports: "true",
		recursive: "true",
	});
	const secrets = await fetch(`https://app.infisical.com/api/v3/secrets/raw?${params}`, {
		headers: { Authorization: `Bearer ${accessToken}` },
	});
	if (!secrets.ok) throw new Error(`Infisical secrets failed: ${secrets.status}`);

	const body = (await secrets.json()) as {
		secrets: Array<{ secretKey: string; secretValue: string }>;
		imports?: Array<{ secrets: Array<{ secretKey: string; secretValue: string }> }>;
	};
	let loaded = 0;
	for (const secret of [
		...body.secrets,
		...(body.imports ?? []).flatMap((group) => group.secrets),
	]) {
		if (!process.env[secret.secretKey]) {
			process.env[secret.secretKey] = secret.secretValue;
			loaded++;
		}
	}
	console.log(`Infisical loaded ${loaded} secrets`);
};
