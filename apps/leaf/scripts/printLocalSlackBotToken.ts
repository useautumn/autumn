// Prints the local Slack app's bot token, decrypted from this env's
// installation row. Run under DEV infisical; dev.ts pipes the output into
// seedSlackAdminInstall when auto-seeding a non-dev run.
import { decrypt } from "../src/lib/crypto.js";
import { env } from "../src/lib/env.js";
import { findInstallation } from "../src/providers/slack/installations.js";

const workspaceId = process.env.SLACK_ADMIN_WORKSPACE_ID;
if (!workspaceId) throw new Error("SLACK_ADMIN_WORKSPACE_ID is not set");

const installation =
	(await findInstallation(`slack_admin:${env.SLACK_CLIENT_ID}`, workspaceId)) ??
	(await findInstallation("slack", workspaceId));
if (!installation) {
	throw new Error(`no slack installation for workspace ${workspaceId}`);
}
console.log(decrypt(installation.bot_access_token));
process.exit(0);
