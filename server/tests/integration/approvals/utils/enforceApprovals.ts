import type { AutumnInt } from "@/external/autumn/autumnCli.js";

/** Turns enforcement on for this client's requests (non-prod org-config override). */
export const enforceApprovals = (client: AutumnInt) => {
	client.headers["org-config"] = JSON.stringify({ approvals_enforced: true });
	return client;
};
