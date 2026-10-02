import type { ShadowAtomConfig } from "@autumn/edge-config";

/** What staff see: no token, not even encrypted, ever leaves the server. */
export const shadowAtomConfigToAdminView = ({
	config,
}: {
	config: ShadowAtomConfig;
}) => ({
	endpointUrl: config.endpointUrl,
	hasAdminToken: config.adminEncryptedToken !== null,
	orgs: Object.fromEntries(
		Object.entries(config.orgs).map(([orgId, { registeredAt, percent }]) => [
			orgId,
			{ registeredAt, percent },
		]),
	),
});
