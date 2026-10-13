import { AppEnv, type CusProductStatus } from "@autumn/shared";
import { initDrizzle } from "../../src/db/initDrizzle.js";
import { createDualLogger } from "../../src/external/logtail/logtailUtils.js";
import type { AutumnContext } from "../../src/honoUtils/HonoEnv.js";
import { RELEVANT_STATUSES } from "../../src/internal/customers/cusProducts/CusProductService.js";
import { countFilteredEntitiesByOrgIdAndEnv } from "../../src/internal/entities/repos/listEntitiesQuery.js";
import { createWorkerContext } from "../../src/queue/createWorkerContext.js";

/**
 * Exercises the real countFilteredEntitiesByOrgIdAndEnv across filter
 * combinations, so the plan-first rewrite is validated through the actual code
 * path (including the plan + other-filter combinations, which take different
 * branches).
 *
 * Run with:
 *   infisical run --env=prod --recursive -- bun run server/experiments/listObjects/verifyPlanFilterCount.ts
 */
const requireEnv = ({ name }: { name: string }) => {
	const value = process.env[name];
	if (!value) {
		throw new Error(
			`${name} is required. These scripts read production-scale data, so they refuse to default to a real org.`,
		);
	}
	return value;
};

const ORG_ID = requireEnv({ name: "ORG_ID" });
const ENV = requireEnv({ name: "ENV" }) as AppEnv;
const PLAN_ID = process.env.PLAN_ID || "enterprise";
const CUSTOMER_ID = requireEnv({ name: "CUSTOMER_ID" });

const inStatuses = RELEVANT_STATUSES as CusProductStatus[];

const CASES: { label: string; query: Record<string, unknown> }[] = [
	{ label: "plans only", query: { plans: [{ id: PLAN_ID, versions: null }] } },
	{ label: "no filters", query: {} },
	{ label: "search only", query: { search: "a" } },
	{
		label: "plans + search",
		query: { plans: [{ id: PLAN_ID, versions: null }], search: "a" },
	},
	{
		label: "plans + customerId",
		query: { plans: [{ id: PLAN_ID, versions: null }], customerId: CUSTOMER_ID },
	},
	{
		label: "plans + processors",
		query: { plans: [{ id: PLAN_ID, versions: null }], processors: ["stripe"] },
	},
];

const main = async () => {
	const { db } = initDrizzle({ maxConnections: 2 });
	const ctx = await createWorkerContext({
		db,
		payload: { orgId: ORG_ID, env: ENV },
		logger: createDualLogger(),
		skipCache: true,
	});
	if (!ctx) throw new Error(`Could not build ctx for org ${ORG_ID}`);

	console.log(`=== countFilteredEntitiesByOrgIdAndEnv (plan=${PLAN_ID}) ===\n`);

	for (const { label, query } of CASES) {
		const startedAt = performance.now();
		const count = await countFilteredEntitiesByOrgIdAndEnv({
			ctx: ctx as AutumnContext,
			// biome-ignore lint/suspicious/noExplicitAny: exercising varied filter shapes
			query: query as any,
			inStatuses,
		});
		const ms = performance.now() - startedAt;
		console.log(
			`${label.padEnd(20)} count=${String(count).padStart(7)}  ${ms.toFixed(0).padStart(7)}ms`,
		);
	}

	process.exit(0);
};

await main();
