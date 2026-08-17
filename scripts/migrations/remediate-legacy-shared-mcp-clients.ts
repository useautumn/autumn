import { getDefaultOAuthScopes } from "@autumn/auth/oauth";
import { oauthClient } from "@autumn/shared";
import {
	MCP_CLIENT_KIND,
	parseOAuthClientMetadata,
} from "@autumn/shared/utils/auth/oauthClientMetadata";
import { loadLocalEnv } from "@server/utils/envUtils";
import { eq } from "drizzle-orm";

loadLocalEnv();

// Dev worktrees (scripts/dw): overlay server/.env.local so the script lands on
// the worktree's Neon branch, matching migrate-functions.ts. Skipped for prod
// (us-east-2 marker), which infisical injects before this script starts.
if (!process.env.DATABASE_URL?.includes("us-east-2")) {
	process.env.ENV_FILE = ".env.local";
	loadLocalEnv({ force: true });
}

// The four legacy SHARED, secretless (PKCE-only) MCP OAuth clients. Live
// access/refresh tokens reference them by client_id, so the rows must stay;
// this remediation resets the attacker-reachable fields rather than deleting.
const LEGACY_SHARED_CLIENT_IDS = [
	"autumn_mcp_claude",
	"autumn_mcp_codex",
	"autumn_mcp_cursor",
	"autumn_mcp_opencode",
] as const;

type LegacySharedClientId = (typeof LEGACY_SHARED_CLIENT_IDS)[number];

// Human review REQUIRED before applying: verified genuine OAuth callback(s) per vendor.
// Leave a vendor's array empty to wipe ALL its redirect URIs (safest; a stale install
// still using the shared client would then need to re-register on next fresh login).
const LEGACY_SHARED_REDIRECT_ALLOWLIST: Record<LegacySharedClientId, string[]> =
	{
		autumn_mcp_claude: [
			/* e.g. "https://claude.ai/api/mcp/auth_callback" — VERIFY */
		],
		autumn_mcp_codex: [
			/* e.g. "http://localhost:1455/auth/callback" — VERIFY */
		],
		autumn_mcp_cursor: [
			/* e.g. "cursor://anysphere.cursor-retrieval/oauth/user-autumn/callback" — VERIFY */
		],
		autumn_mcp_opencode: [
			/* e.g. "http://localhost:60906/callback" — VERIFY */
		],
	};

// Write only with --apply; without it the script prints the planned diff and exits.
const shouldApply = process.argv.includes("--apply");

const remediateClient = async ({
	db,
	clientId,
}: {
	db: Awaited<typeof import("@/db/initDrizzle.js")>["db"];
	clientId: LegacySharedClientId;
}) => {
	const [row] = await db
		.select({
			id: oauthClient.id,
			clientId: oauthClient.clientId,
			scopes: oauthClient.scopes,
			redirectUris: oauthClient.redirectUris,
			metadata: oauthClient.metadata,
		})
		.from(oauthClient)
		.where(eq(oauthClient.clientId, clientId))
		.limit(1);

	if (!row) {
		console.warn(
			`[remediate] MISSING oauth_client row for ${clientId} — nothing to remediate.`,
		);
		return;
	}

	const existingMetadata = parseOAuthClientMetadata(row.metadata);
	if (existingMetadata.kind !== MCP_CLIENT_KIND) {
		console.warn(
			`[remediate] ${clientId}: metadata.kind was "${existingMetadata.kind ?? "<missing>"}", expected "${MCP_CLIENT_KIND}" — stamping it so the row keeps classifying as an MCP client.`,
		);
	}

	const nextMetadata = {
		...existingMetadata,
		kind: MCP_CLIENT_KIND,
		legacy_shared: true,
	};
	const nextScopes = getDefaultOAuthScopes();
	const nextRedirectUris = LEGACY_SHARED_REDIRECT_ALLOWLIST[clientId];

	console.log(`\n[remediate] ${clientId}`);
	console.log(`  redirect_uris: ${JSON.stringify(row.redirectUris)}`);
	console.log(`             ->  ${JSON.stringify(nextRedirectUris)}`);
	console.log(`  scopes:        ${JSON.stringify(row.scopes)}`);
	console.log(`             ->  ${JSON.stringify(nextScopes)}`);
	console.log(`  metadata:      ${JSON.stringify(existingMetadata)}`);
	console.log(`             ->  ${JSON.stringify(nextMetadata)}`);

	if (!shouldApply) return;

	await db
		.update(oauthClient)
		.set({
			scopes: nextScopes,
			redirectUris: nextRedirectUris,
			metadata: nextMetadata,
			updatedAt: new Date(),
		})
		.where(eq(oauthClient.clientId, clientId));

	console.log(`  applied.`);
};

const remediate = async () => {
	// Dynamic import so env is loaded before initDrizzle reads DATABASE_URL.
	const { db, client } = await import("@/db/initDrizzle.js");

	console.log(
		shouldApply
			? "[remediate] APPLYING changes to oauth_client rows."
			: "[remediate] DRY RUN — pass --apply to write. No rows will change.",
	);

	try {
		for (const clientId of LEGACY_SHARED_CLIENT_IDS) {
			await remediateClient({ db, clientId });
		}
	} finally {
		await client.end();
	}
};

await remediate();
process.exit(0);
