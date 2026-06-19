export const isDeploymentApiKeyMeta = (meta: unknown) => {
	const value = meta && typeof meta === "object" ? meta : {};
	return (
		(value as { fromCli?: unknown }).fromCli !== true &&
		(value as { fromCli?: unknown }).fromCli !== "true" &&
		(value as { created_via?: unknown }).created_via !== "oauth"
	);
};
