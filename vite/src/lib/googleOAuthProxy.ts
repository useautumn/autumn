export function googleOAuthUrlForBrowser({
	providerUrl,
	browserOrigin,
}: {
	providerUrl: string;
	browserOrigin: string;
}): string {
	const provider = new URL(providerUrl);
	return new URL(
		`${provider.pathname}${provider.search}${provider.hash}`,
		browserOrigin,
	).toString();
}
