import { AppEnv } from "@autumn/shared";
import type { SubjectCoreRow } from "@server/internal/customers/repos/getFullSubject.js";
import { resultToFullSubject } from "@server/internal/customers/repos/getFullSubject.js";
import { getSubjectCoreQuery } from "@server/internal/customers/repos/sql/getSubjectCoreQuery.js";
import { sql } from "drizzle-orm";
import {
	initDrizzle,
	prodTestCustomerId,
	prodTestEntityId,
	prodTestOrgId,
} from "./experimentEnv";

// Run with: bun run experiments/getFullSubjectExperiment.ts

const ORG_ID = prodTestOrgId;
const ENV = AppEnv.Live;
const CUSTOMER_ID = prodTestCustomerId;
const ENTITY_ID = prodTestEntityId;

const runPath = async ({
	db,
	label,
	customerId,
	entityId,
}: {
	db: ReturnType<typeof initDrizzle>["db"];
	label: string;
	customerId?: string;
	entityId?: string;
}) => {
	const query = getSubjectCoreQuery({
		orgId: ORG_ID,
		env: ENV,
		customerId,
		entityId,
	});

	console.log(`\n=== ${label} ===`);
	console.log(`  orgId:      ${ORG_ID}`);
	console.log(`  customerId: ${customerId ?? "(none)"}`);
	console.log(`  entityId:   ${entityId ?? "(none)"}`);
	console.log("");

	const queryStart = performance.now();
	const result = await db.execute(query);
	const queryMs = (performance.now() - queryStart).toFixed(2);

	if (!result || result.length === 0) {
		console.log(`  No rows returned. Query: ${queryMs}ms`);
		return;
	}

	const row = result[0] as unknown as SubjectCoreRow;
	console.log(`  Query:              ${queryMs}ms`);
	console.log(`  Rows returned:      ${result.length}`);
	console.log(
		`  customer_products:  ${(row.customer_products as unknown[])?.length ?? 0}`,
	);
	console.log(
		`  customer_ents:      ${(row.customer_entitlements as unknown[])?.length ?? 0}`,
	);
	console.log(
		`  extra_cus_ents:     ${(row.extra_customer_entitlements as unknown[])?.length ?? 0}`,
	);
	console.log(`  products:           ${(row.products as unknown[])?.length ?? 0}`);
	console.log(
		`  entitlements:       ${(row.entitlements as unknown[])?.length ?? 0}`,
	);
	console.log(`  prices:             ${(row.prices as unknown[])?.length ?? 0}`);
	console.log(
		`  rollovers:          ${(row.rollovers as unknown[])?.length ?? 0}`,
	);
	console.log(
		`  free_trials:        ${(row.free_trials as unknown[])?.length ?? 0}`,
	);
	console.log(
		`  subscriptions:      ${(row.subscriptions as unknown[])?.length ?? 0}`,
	);
	console.log(`  invoices:           ${(row.invoices as unknown[])?.length ?? 0}`);
	console.log(`  entity:             ${row.entity ? "yes" : "no"}`);
	console.log(
		`  entity_aggregations: ${row.entity_aggregations ? "yes" : "no"}`,
	);

	const hydrateStart = performance.now();
	const fullSubject = resultToFullSubject({ row });
	const hydrateMs = (performance.now() - hydrateStart).toFixed(2);

	const jsonOutput = JSON.stringify(fullSubject);
	const sizeBytes = Buffer.byteLength(jsonOutput, "utf8");
	const sizeKb = (sizeBytes / 1024).toFixed(2);

	console.log(`  Hydration:          ${hydrateMs}ms`);
	console.log(`  FullSubject type:   ${fullSubject.subjectType}`);
	console.log(`  JSON size:          ${sizeKb} KB (${sizeBytes} bytes)`);

	console.log(`\n  --- EXPLAIN (ANALYZE, BUFFERS) ---\n`);
	const explain = sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${query}`;
	const explainResult = await db.execute(explain);
	for (const r of explainResult) {
		console.log(`  ${(r as Record<string, unknown>)["QUERY PLAN"]}`);
	}
};

async function main() {
	const { db, client } = initDrizzle({ maxConnections: 2 });

	try {
		await db.execute(sql`SELECT 1`);

		await runPath({
			db,
			label: "Path 1: Customer subject (customerId only)",
			customerId: CUSTOMER_ID,
		});

		await runPath({
			db,
			label: "Path 2: Entity subject (customerId + entityId)",
			customerId: CUSTOMER_ID,
			entityId: ENTITY_ID,
		});

		await runPath({
			db,
			label: "Path 3: Entity subject (entityId only — entity-first CTE)",
			entityId: ENTITY_ID,
		});
	} finally {
		await client.end();
	}
}

main().catch(console.error);
