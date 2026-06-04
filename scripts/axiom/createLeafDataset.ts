/**
 * Idempotently provisions the Axiom `leaf` dataset used for Leaf runtime logs
 * and MCP usage analytics, and configures its map fields.
 *
 * Map fields ("vacuum" the unpredictable nested payloads into a single column):
 * Tool payloads, req/res bodies, and per-log details have open-ended shape.
 * Every distinct top-level key would otherwise become its own mapped field and
 * quickly blow Axiom's per-dataset field limit. These map fields keep nested
 * keys inside one field each while staying queryable.
 *
 * Run via the Axiom CLI (resolves AXIOM_ADMIN_TOKEN from infisical):
 *   bun axiom create-leaf          # dev
 *   bun axiom:prod create-leaf     # prod
 *
 * Notes:
 * - AXIOM_ADMIN_TOKEN must be a personal API token with dataset create/update
 *   scope, NOT the `xaat-` ingest token used at runtime.
 * - Safe to re-run: dataset creation tolerates "already exists", and existing
 *   map fields are read before missing fields are created.
 */

const AXIOM_BASE = "https://api.axiom.co/v2";
const DATASET = "leaf";
const DATASET_DESCRIPTION = "Leaf runtime logs and MCP usage analytics";

// Nested, open-ended payloads stored as map fields to stay under the field
// limit. Keep this list minimal — only genuinely high-cardinality objects.
const MAP_FIELDS = [
	"context",
	"data",
	"extras",
	"input",
	"output",
	"req",
	"res",
];

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

const getMapFields = async (token: string) => {
	const res = await fetch(
		`${AXIOM_BASE}/datasets/${encodeURIComponent(DATASET)}/mapfields`,
		{
			method: "GET",
			headers: authHeaders(token),
		},
	);

	const text = await res.text();
	if (!res.ok) {
		throw new Error(`Failed to list map fields: ${res.status} ${text}`);
	}

	const parsed = JSON.parse(text) as unknown;
	if (!Array.isArray(parsed) || parsed.some((name) => typeof name !== "string")) {
		throw new Error(`Unexpected map fields response: ${text}`);
	}

	return new Set(parsed);
};

const setMapField = async ({
	existing,
	name,
	token,
}: {
	existing: Set<string>;
	name: string;
	token: string;
}) => {
	if (existing.has(name)) {
		console.log(`  = map field: ${name} (already set)`);
		return;
	}

	const res = await fetch(
		`${AXIOM_BASE}/datasets/${encodeURIComponent(DATASET)}/mapfields`,
		{
			method: "POST",
			headers: authHeaders(token),
			body: JSON.stringify({ name }),
		},
	);

	const text = await res.text();
	if (res.ok) {
		existing.add(name);
		console.log(`  + map field: ${name}`);
		return;
	}

	if (/exist/i.test(text)) {
		existing.add(name);
		console.log(`  = map field: ${name} (already set)`);
		return;
	}

	throw new Error(`Failed to set map field "${name}": ${res.status} ${text}`);
};

const setMapFields = async (token: string) => {
	const existing = await getMapFields(token);
	for (const name of MAP_FIELDS) {
		await setMapField({ existing, name, token });
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
