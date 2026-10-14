export const LOCAL_CLI_CLIENT_ID = "khicXGthBbGMIWmpgodOTDcCCJHJMDpN";
export const DEV_CLI_CLIENT_ID = "NiKwaSyAfaeEEKEvFaUYihTXdTPtIRCk";
export const CLI_CLIENT_ID = "hAWUopQqLnsSwuRgeRzIBzKslwXmQUSr";

export const OAUTH_PORT_BASE = 31448;

export const OAUTH_PORT_RANGE = 5;

export const OAUTH_PORTS = Array.from(
	{ length: OAUTH_PORT_RANGE },
	(_, i) => OAUTH_PORT_BASE + i,
);

export function getOAuthRedirectUri(port: number): string {
	return `http://localhost:${port}/`;
}
