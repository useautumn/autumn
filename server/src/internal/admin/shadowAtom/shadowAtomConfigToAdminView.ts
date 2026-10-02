import type {
	ShadowAtomConfig,
	ShadowAtomEnvConfig,
} from "@autumn/edge-config";

const envToAdminView = ({ config }: { config: ShadowAtomEnvConfig }) => ({
	endpointUrl: config.endpointUrl,
	hasAdminToken: config.adminEncryptedToken !== null,
	orgs: Object.fromEntries(
		Object.entries(config.orgs).map(([orgId, { registeredAt, percent }]) => [
			orgId,
			{ registeredAt, percent },
		]),
	),
});

/** What staff see: no token, not even encrypted, ever leaves the server. */
export const shadowAtomConfigToAdminView = ({
	config,
}: {
	config: ShadowAtomConfig;
}) => ({
	sandbox: envToAdminView({ config: config.sandbox }),
	live: envToAdminView({ config: config.live }),
});
