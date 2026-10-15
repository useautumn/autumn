import type { AutumnInt } from "@/external/autumn/autumnCli.js";

/** Turns enforcement on for this client's requests (test-only header override). */
export const enforceApprovals = (client: AutumnInt) => {
	client.headers["org-config"] = JSON.stringify({ approvals_enforced: true });
	return client;
};
