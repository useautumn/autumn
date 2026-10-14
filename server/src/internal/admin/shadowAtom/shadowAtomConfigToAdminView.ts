import type { ShadowAtomConfig } from "@autumn/edge-config";

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
