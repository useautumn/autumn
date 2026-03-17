// OAuth constants for CLI authentication

/** The OAuth client ID for the CLI (public client) */
// export const CLI_CLIENT_ID = "khicXGthBbGMIWmpgodOTDcCCJHJMDpN"; (local i think)
// export const CLI_CLIENT_ID = "NiKwaSyAfaeEEKEvFaUYihTXdTPtIRCk" (dev i think)
export const CLI_CLIENT_ID = "hAWUopQqLnsSwuRgeRzIBzKslwXmQUSr"; // (prod i think)

/** Base port for the local OAuth callback server */
export const OAUTH_PORT_BASE = 31448;

/** Number of ports to try if the base port is in use */
export const OAUTH_PORT_RANGE = 5;

/** All valid OAuth ports (31448-31452) */
export const OAUTH_PORTS = Array.from(
	{ length: OAUTH_PORT_RANGE },
	(_, i) => OAUTH_PORT_BASE + i,
);

/** Get OAuth redirect URI for a specific port */
export function getOAuthRedirectUri(port: number): string {
	return `http://localhost:${port}/`;
}
