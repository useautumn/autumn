/**
 * Idempotently provisions an Axiom dataset and its map fields: creating one that exists, or a map field that is
 * already set, is a no-op. Needs a personal API token with dataset scope in AXIOM_ADMIN_TOKEN, not an `xaat-` ingest token.
 */

const AXIOM_BASE = "https://api.axiom.co/v2";

type AxiomDatasetSpec = {
	name: string;
	description: string;
	/** Open-ended nested objects kept in one column each, so their keys never count toward the field limit. */
	mapFields: string[];
};

const authHeaders = (token: string) => ({
	Authorization: `Bearer ${token}`,
	"Content-Type": "application/json",
});

const datasetPath = ({ name }: { name: string }) =>
	`${AXIOM_BASE}/datasets/${encodeURIComponent(name)}`;

const isAlreadyThere = ({ status, text }: { status: number; text: string }) =>
	status === 409 || /exist/i.test(text);

const createDataset = async ({
	token,
	spec,
}: {
	token: string;
	spec: AxiomDatasetSpec;
}) => {
	const res = await fetch(`${AXIOM_BASE}/datasets`, {
		method: "POST",
		headers: authHeaders(token),
		body: JSON.stringify({ name: spec.name, description: spec.description }),
	});
	const text = await res.text();
	if (res.ok) return console.log(`  + created dataset \`${spec.name}\``);
	if (isAlreadyThere({ status: res.status, text }))
		return console.log(`  = dataset \`${spec.name}\` already exists`);
	throw new Error(`Failed to create dataset: ${res.status} ${text}`);
};

const getMapFields = async ({
	token,
	spec,
}: {
	token: string;
	spec: AxiomDatasetSpec;
}) => {
	const res = await fetch(`${datasetPath(spec)}/mapfields`, {
		headers: authHeaders(token),
	});
	const text = await res.text();
	if (!res.ok)
		throw new Error(`Failed to list map fields: ${res.status} ${text}`);
	const parsed = JSON.parse(text) as unknown;
	if (!Array.isArray(parsed) || parsed.some((name) => typeof name !== "string"))
		throw new Error(`Unexpected map fields response: ${text}`);
	return new Set<string>(parsed);
};

const setMapField = async ({
	token,
	spec,
	name,
}: {
	token: string;
	spec: AxiomDatasetSpec;
	name: string;
}) => {
	const res = await fetch(`${datasetPath(spec)}/mapfields`, {
		method: "POST",
		headers: authHeaders(token),
		body: JSON.stringify({ name }),
	});
	const text = await res.text();
	if (res.ok) return console.log(`  + map field: ${name}`);
	if (isAlreadyThere({ status: res.status, text }))
		return console.log(`  = map field: ${name} (already set)`);
	throw new Error(`Failed to set map field "${name}": ${res.status} ${text}`);
};

const setMapFields = async ({
	token,
	spec,
}: {
	token: string;
	spec: AxiomDatasetSpec;
}) => {
	if (spec.mapFields.length === 0) return;
	const existing = await getMapFields({ token, spec });
	for (const name of spec.mapFields) {
		if (existing.has(name)) console.log(`  = map field: ${name} (already set)`);
		else await setMapField({ token, spec, name });
	}
};

export const ensureAxiomDataset = async (spec: AxiomDatasetSpec) => {
	const token = process.env.AXIOM_ADMIN_TOKEN;
	if (!token)
		throw new Error(
			"AXIOM_ADMIN_TOKEN env var is required (personal API token, not xaat-* ingest token)",
		);

	console.log(`Provisioning Axiom dataset \`${spec.name}\`...`);
	await createDataset({ token, spec });
	await setMapFields({ token, spec });
	console.log("\nDone.");
};
