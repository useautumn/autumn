/**
 * Idempotently creates/updates Axiom virtual fields on the `otel` dataset so
 * APL queries can use the same column names as the `express` dataset
 * (`req.url`, `context.org_slug`, `statusCode`, etc.).
 *
 * Usage:
 *   AXIOM_API_TOKEN=<personal-token> bun scripts/axiom/setOtelVirtualFields.ts
 *
 * Notes:
 * - AXIOM_API_TOKEN must be a personal API token with dataset-write scope,
 *   NOT the `xaat-` ingest token used by the server.
 * - Safe to re-run; existing fields with matching names are updated in place.
 */

import "dotenv/config";

const AXIOM_BASE = "https://api.axiom.co/v2";
const DATASET = "otel";

type VirtualField = {
	name: string;
	expression: string;
	description: string;
};

// Constructors: keep the mapping terse. One per OTel source location.
const custom = ({
	name,
	attr,
	description,
}: {
	name: string;
	attr: string;
	description: string;
}): VirtualField => ({
	name,
	expression: `attributes.custom.${attr}`,
	description,
});

const semconv = ({
	name,
	path,
	description,
}: {
	name: string;
	path: string;
	description: string;
}): VirtualField => ({
	name,
	expression: `attributes.${path}`,
	description,
});

// Mirrors the camelCase virtual fields on the `express` dataset so queries
// share vocabulary across both datasets. Existing express virtual fields:
// reqId, orgId, orgSlug, cusId, method, url, statusCode (native).
const TARGET_FIELDS: VirtualField[] = [
	// Match existing express virtual fields 1:1
	custom({
		name: "reqId",
		attr: "req_id",
		description: "Request id (mirrors express reqId)",
	}),
	custom({
		name: "orgId",
		attr: "org_id",
		description: "Org id (mirrors express orgId)",
	}),
	custom({
		name: "orgSlug",
		attr: "org_slug",
		description: "Org slug (mirrors express orgSlug)",
	}),
	custom({
		name: "cusId",
		attr: "customer_id",
		description: "Customer id (mirrors express cusId)",
	}),
	semconv({
		name: "method",
		path: "http.request.method",
		description: "HTTP method (mirrors express method)",
	}),
	semconv({
		name: "url",
		path: "url.path",
		description: "HTTP path with params filled in (mirrors express url)",
	}),
	semconv({
		name: "statusCode",
		path: "http.response.status_code",
		description: "HTTP status code (mirrors express statusCode)",
	}),

	// Additional OTel-only dimensions (no existing express virtual field)
	custom({
		name: "entityId",
		attr: "entity_id",
		description: "Entity id",
	}),
	custom({
		name: "env",
		attr: "env",
		description: "App env (sandbox/live)",
	}),
	custom({
		name: "region",
		attr: "region",
		description: "Server AWS region",
	}),
	custom({
		name: "userId",
		attr: "user_id",
		description: "Dashboard user id",
	}),
	custom({
		name: "authType",
		attr: "auth_type",
		description: "Auth method (Secret/Publishable/Dashboard/Stripe/Worker)",
	}),
	custom({
		name: "apiVersion",
		attr: "api_version",
		description: "API version (semver)",
	}),
	custom({
		name: "fullSubjectRolloutEnabled",
		attr: "full_subject_rollout_enabled",
		description: "FullSubject rollout flag",
	}),
	custom({
		name: "workflowId",
		attr: "workflow_id",
		description: "Worker/cron job id",
	}),
	custom({
		name: "workflowName",
		attr: "workflow_name",
		description: "Worker/cron job name",
	}),
];

type ExistingVField = {
	id: string;
	name: string;
	expression: string;
	description?: string;
	dataset: string;
};

const token = process.env.AXIOM_API_TOKEN;
if (!token) {
	console.error(
		"AXIOM_API_TOKEN env var is required (personal API token, not xaat-* ingest token)",
	);
	process.exit(1);
}

const authHeaders = {
	Authorization: `Bearer ${token}`,
	"Content-Type": "application/json",
};

const listExisting = async (): Promise<ExistingVField[]> => {
	const res = await fetch(
		`${AXIOM_BASE}/vfields?dataset=${encodeURIComponent(DATASET)}`,
		{ headers: authHeaders },
	);
	if (!res.ok) {
		throw new Error(
			`Failed to list virtual fields: ${res.status} ${await res.text()}`,
		);
	}
	return (await res.json()) as ExistingVField[];
};

const createField = async (field: VirtualField) => {
	const res = await fetch(`${AXIOM_BASE}/vfields`, {
		method: "POST",
		headers: authHeaders,
		body: JSON.stringify({ dataset: DATASET, ...field }),
	});
	if (!res.ok) {
		throw new Error(
			`Failed to create "${field.name}": ${res.status} ${await res.text()}`,
		);
	}
};

const updateField = async (id: string, field: VirtualField) => {
	const res = await fetch(`${AXIOM_BASE}/vfields/${id}`, {
		method: "PUT",
		headers: authHeaders,
		body: JSON.stringify({ dataset: DATASET, ...field }),
	});
	if (!res.ok) {
		throw new Error(
			`Failed to update "${field.name}" (${id}): ${res.status} ${await res.text()}`,
		);
	}
};

const run = async () => {
	console.log(
		`Syncing ${TARGET_FIELDS.length} virtual fields on \`${DATASET}\`...`,
	);

	const existing = await listExisting();
	const existingByName = new Map(existing.map((f) => [f.name, f]));

	let created = 0;
	let updated = 0;
	let unchanged = 0;

	for (const field of TARGET_FIELDS) {
		const current = existingByName.get(field.name);
		if (!current) {
			await createField(field);
			console.log(`  + created  ${field.name}`);
			created++;
			continue;
		}

		if (
			current.expression === field.expression &&
			current.description === field.description
		) {
			unchanged++;
			continue;
		}

		await updateField(current.id, field);
		console.log(`  ~ updated  ${field.name}`);
		updated++;
	}

	console.log(
		`\nDone: ${created} created, ${updated} updated, ${unchanged} unchanged.`,
	);
	console.log(
		`${existing.length - updated - unchanged} existing field(s) not in target list were left untouched.`,
	);
};

await run();
