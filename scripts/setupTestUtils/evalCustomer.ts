#!/usr/bin/env bun
/**
 * Seeds a customer inside an ax-evals throwaway org: create via API, attach a
 * Stripe test payment method, then run attach/license setup calls — so
 * integration evals can start from "existing subscriber" states.
 *
 *   bun scripts/setupTestUtils/evalCustomer.ts '<json>'
 *
 * JSON spec:
 * {
 *   "backendUrl": "http://localhost:8580",
 *   "secretKey": "am_sk_test_...",
 *   "orgId": "test-ax-eval-...",
 *   "customer": { "id": "user_123", "name": "Ada", "email": "ada@acme.dev" },
 *   "paymentMethod": true,
 *   "attach": [{ "plan_id": "team" }],
 *   "licenseAssignments": [{ "plan_id": "workspace", "entity_id": "ws_1", "name": "Workspace 1", "feature_id": "workspaces" }]
 * }
 */
import { AppEnv, organizations } from "@autumn/shared";
import { attachPmToCus } from "@server/external/stripe/stripeCusUtils.js";
import { CusService } from "@server/internal/customers/CusService.js";
import { eq } from "drizzle-orm";

type SeedSpec = {
	backendUrl: string;
	secretKey: string;
	orgId: string;
	customer: { id: string; name?: string; email?: string };
	paymentMethod?: boolean;
	attach?: Record<string, unknown>[];
	licenseAssignments?: Record<string, unknown>[];
	track?: Record<string, unknown>[];
};

const api = async ({
	spec,
	path,
	body,
}: {
	spec: SeedSpec;
	path: string;
	body: Record<string, unknown>;
}) => {
	const res = await fetch(`${spec.backendUrl}/v1${path}`, {
		method: "POST",
		headers: {
			authorization: `Bearer ${spec.secretKey}`,
			"content-type": "application/json",
		},
		body: JSON.stringify(body),
	});
	const text = await res.text();
	if (!res.ok)
		throw new Error(`${path} failed (${res.status}): ${text.slice(0, 400)}`);
	return JSON.parse(text) as Record<string, unknown>;
};

type OracleBalances = Record<string, { usage?: number }>;

const readBalances = async ({
	spec,
}: {
	spec: SeedSpec;
}): Promise<OracleBalances> => {
	const res = await fetch(
		`${spec.backendUrl}/v1/customers/${spec.customer.id}`,
		{ headers: { authorization: `Bearer ${spec.secretKey}` } },
	);
	if (!res.ok) return {};
	const body = (await res.json()) as { balances?: OracleBalances };
	return body.balances ?? {};
};

const waitFor = async ({
	spec,
	label,
	check,
	timeoutMs = 15_000,
}: {
	spec: SeedSpec;
	label: string;
	check: (balances: OracleBalances) => boolean;
	timeoutMs?: number;
}) => {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (check(await readBalances({ spec }))) return;
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	throw new Error(`timed out waiting for ${label}`);
};

const main = async () => {
	const spec = JSON.parse(process.argv[2] ?? "{}") as SeedSpec;
	if (!spec.orgId?.startsWith("test-ax-eval-"))
		throw new Error(`refusing to seed non-eval org "${spec.orgId}"`);

	await api({
		spec,
		path: "/customers",
		body: {
			id: spec.customer.id,
			name: spec.customer.name,
			email: spec.customer.email,
		},
	});

	if (spec.paymentMethod) {
		const { db, client } = (
			await import("@server/db/initDrizzle.js")
		).initDrizzle({ databaseUrl: process.env.DATABASE_URL });
		try {
			const org = await db.query.organizations.findFirst({
				where: eq(organizations.id, spec.orgId),
			});
			if (!org) throw new Error(`org ${spec.orgId} not found`);
			const customer = await CusService.get({
				db,
				orgId: spec.orgId,
				env: AppEnv.Sandbox,
				idOrInternalId: spec.customer.id,
			});
			if (!customer) throw new Error(`customer ${spec.customer.id} not found`);
			await attachPmToCus({
				db,
				customer,
				org: org as never,
				env: AppEnv.Sandbox,
			});
		} finally {
			await client.end();
		}
	}

	for (const attach of spec.attach ?? []) {
		await api({
			spec,
			path: "/billing.attach",
			body: { customer_id: spec.customer.id, ...attach },
		});
	}

	for (const assignment of spec.licenseAssignments ?? []) {
		const { entity_id, name, feature_id, ...rest } = assignment;
		await api({
			spec,
			path: "/licenses.attach",
			body: {
				customer_id: spec.customer.id,
				entities: [{ entity_id, name, feature_id }],
				...rest,
			},
		});
	}

	for (const track of spec.track ?? []) {
		const featureId = track.feature_id as string;
		const value = (track.value as number) ?? 1;
		// Attach creates the feature balance asynchronously; a track that lands
		// first is dropped silently. Wait for the balance, then verify usage.
		await waitFor({
			spec,
			label: `balance for ${featureId}`,
			check: (balances) => balances[featureId] !== undefined,
		});
		await api({
			spec,
			path: "/track",
			body: { customer_id: spec.customer.id, ...track },
		});
		await waitFor({
			spec,
			label: `usage ${value} on ${featureId}`,
			check: (balances) => (balances[featureId]?.usage ?? 0) >= value,
		});
	}

	console.log(JSON.stringify({ seeded: spec.customer.id }));
};

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exit(1);
	});
