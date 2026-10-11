/**
 * Idempotently provisions an Axiom dataset, its map fields and its virtual fields: creating one that exists, or a
 * field that is already set, is a no-op, and a virtual field whose expression changed is updated in place. Needs a personal API token with dataset scope in AXIOM_ADMIN_TOKEN, not an `xaat-` ingest token.
 */

const AXIOM_BASE = "https://api.axiom.co/v2";

type AxiomDatasetSpec = {
	name: string;
	description: string;
	/** Open-ended nested objects kept in one column each, so their keys never count toward the field limit. */
	mapFields: string[];
	/** Query-time columns: names to query by, computed from where the data actually lands. */
	virtualFields?: AxiomVirtualField[];
};

export type AxiomVirtualField = {
	name: string;
	expression: string;
	description: string;
};

type ExistingVirtualField = AxiomVirtualField & { id: string; dataset: string };

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

const getVirtualFields = async ({
	token,
	spec,
}: {
	token: string;
	spec: AxiomDatasetSpec;
}) => {
	const res = await fetch(
		`${AXIOM_BASE}/vfields?dataset=${encodeURIComponent(spec.name)}`,
		{ headers: authHeaders(token) },
	);
	const text = await res.text();
	if (!res.ok)
		throw new Error(`Failed to list virtual fields: ${res.status} ${text}`);
	// Virtual fields are listed org-wide by id: keep only this dataset's, so another dataset's is never updated.
	const existing = (JSON.parse(text) as ExistingVirtualField[]).filter(
		(field) => field.dataset === spec.name,
	);
	return new Map(existing.map((field) => [field.name, field]));
};

const putVirtualField = async ({
	token,
	spec,
	field,
	id,
}: {
	token: string;
	spec: AxiomDatasetSpec;
	field: AxiomVirtualField;
	id: string | null;
}) => {
	const res = await fetch(`${AXIOM_BASE}/vfields${id ? `/${id}` : ""}`, {
		method: id ? "PUT" : "POST",
		headers: authHeaders(token),
		body: JSON.stringify({ dataset: spec.name, ...field }),
	});
	const text = await res.text();
	if (!res.ok)
		throw new Error(
			`Failed to set virtual field "${field.name}": ${res.status} ${text}`,
		);
	console.log(`  ${id ? "~" : "+"} virtual field: ${field.name}`);
};

const setVirtualFields = async ({
	token,
	spec,
}: {
	token: string;
	spec: AxiomDatasetSpec;
}) => {
	if (!spec.virtualFields?.length) return;
	const existing = await getVirtualFields({ token, spec });
	for (const field of spec.virtualFields) {
		const current = existing.get(field.name);
		const isUnchanged =
			current?.expression === field.expression &&
			current.description === field.description;
		if (isUnchanged)
			console.log(`  = virtual field: ${field.name} (already set)`);
		else await putVirtualField({ token, spec, field, id: current?.id ?? null });
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
	await setVirtualFields({ token, spec });
	console.log("\nDone.");
};
