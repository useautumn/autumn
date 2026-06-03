/**
 * Idempotently provisions the Axiom `leaf` dataset used for MCP usage
 * analytics (events emitted from packages/mcp `tool.execute`), and configures
 * its map fields.
 *
 * Map fields ("vacuum" the unpredictable nested payloads into a single column):
 * MCP tool `input`/`output` payloads have an open-ended shape — every distinct
 * arg key would otherwise become its own mapped field and quickly blow Axiom's
 * per-dataset field limit. Declaring `input` and `output` as map fields stores
 * their nested keys inside one field each, so they never count toward the limit
 * while staying queryable (e.g. `where input.customer_id == '...'`).
 *
 * Run via the Axiom CLI (resolves AXIOM_ADMIN_TOKEN from infisical):
 *   bun axiom create-leaf          # dev
 *   bun axiom:prod create-leaf     # prod
 *
 * Notes:
 * - AXIOM_ADMIN_TOKEN must be a personal API token with dataset create/update
 *   scope, NOT the `xaat-` ingest token used at runtime.
 * - Safe to re-run: dataset creation tolerates "already exists", and the map
 *   field list is declared via PUT (full replace), so re-running converges.
 */

const AXIOM_BASE = "https://api.axiom.co/v2";
const DATASET = "leaf";
const DATASET_DESCRIPTION = "Leaf app MCP usage analytics (per tool.execute)";

// Nested, open-ended payloads stored as map fields to stay under the field
// limit. Keep this list minimal — only genuinely high-cardinality objects.
const MAP_FIELDS = ["input", "output"];

const authHeaders = (token: string) => ({
	Authorization: `Bearer ${token}`,
	"Content-Type": "application/json",
});

const createDataset = async (token: string) => {
	const res = await fetch(`${AXIOM_BASE}/datasets`, {
		method: "POST",
		headers: authHeaders(token),
		body: JSON.stringify({
			name: DATASET,
			description: DATASET_DESCRIPTION,
		}),
	});

	if (res.ok) {
		console.log(`  + created dataset \`${DATASET}\``);
		return;
	}

	// 409 (or a 400 mentioning existence) means it's already there — fine.
	const text = await res.text();
	if (res.status === 409 || /exist/i.test(text)) {
		console.log(`  = dataset \`${DATASET}\` already exists`);
		return;
	}

	throw new Error(`Failed to create dataset: ${res.status} ${text}`);
};

const setMapField = async (token: string, name: string) => {
	const res = await fetch(
		`${AXIOM_BASE}/datasets/${encodeURIComponent(DATASET)}/mapfields`,
		{
			method: "POST",
			headers: authHeaders(token),
			body: JSON.stringify({ name }),
		},
	);

	// Re-declaring an existing map field returns a 4xx mentioning existence.
	const text = await res.text();
	if (res.ok) {
		console.log(`  + map field: ${name}`);
		return;
	}
	if (/exist/i.test(text)) {
		console.log(`  = map field: ${name} (already set)`);
		return;
	}

	throw new Error(`Failed to set map field "${name}": ${res.status} ${text}`);
};

const setMapFields = async (token: string) => {
	for (const name of MAP_FIELDS) {
		await setMapField(token, name);
	}
};

/** Provisions the `leaf` dataset and its map fields. */
export const createLeafDataset = async () => {
	const token = process.env.AXIOM_ADMIN_TOKEN;
	if (!token) {
		throw new Error(
			"AXIOM_ADMIN_TOKEN env var is required (personal API token, not xaat-* ingest token)",
		);
	}

	console.log(`Provisioning Axiom dataset \`${DATASET}\`...`);
	await createDataset(token);
	await setMapFields(token);
	console.log("\nDone.");
};
