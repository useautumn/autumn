import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { AppEnv } from "@autumn/shared";
import { sql } from "drizzle-orm";
import {
	initDrizzle,
	prodTestCustomerId,
	prodTestEntityId,
	prodTestOrgId,
} from "./experimentEnv";

const { getFullSubjectQuery } = await import(
	"../src/internal/customers/repos/getFullSubject/getFullSubjectQuery"
);
const { RELEVANT_STATUSES } = await import(
	"../src/internal/customers/cusProducts/CusProductService"
);

// Run with:
//   bun run experiments/explainGetFullSubject.ts
// Or scoped to an entity:
//   PROD_TEST_ENTITY_ID=... bun run experiments/explainGetFullSubject.ts

const main = async () => {
	const orgId = prodTestOrgId;
	const env = AppEnv.Live;
	const customerId = prodTestCustomerId;
	const entityId = prodTestEntityId;

	const { db } = initDrizzle();

	const query = getFullSubjectQuery({
		orgId,
		env,
		customerId,
		entityId,
		inStatuses: RELEVANT_STATUSES,
	});

	console.log(
		`--- Running full subject query (customer=${customerId}${entityId ? `, entity=${entityId}` : ""}) ---`,
	);
	const start = performance.now();
	const result = await db.execute(query);
	const elapsed = performance.now() - start;
	console.log(`Rows returned: ${result.length}`);
	console.log(`Wall-clock time: ${elapsed.toFixed(2)}ms`);

	// The full row payload is enormous — dump it to a file and print a summary.
	const outDir = resolve(import.meta.dir, "out");
	try {
		const { mkdirSync } = await import("node:fs");
		mkdirSync(outDir, { recursive: true });
	} catch {
		// ignore
	}
	const resultPath = resolve(outDir, "getFullSubject-result.json");
	writeFileSync(resultPath, JSON.stringify(result, null, 2));
	console.log(`Result written to: ${resultPath}`);

	const row0 = (result[0] ?? {}) as Record<string, unknown>;
	const summarize = (value: unknown): unknown => {
		if (Array.isArray(value)) return `Array(len=${value.length})`;
		if (value && typeof value === "object")
			return `Object(keys=${Object.keys(value).length})`;
		return value;
	};
	console.log("\n--- Top-level fields (summary) ---");
	for (const [key, value] of Object.entries(row0)) {
		console.log(`  ${key}: ${summarize(value)}`);
	}

	const aggregated = (row0.aggregated_customer_entitlements ?? []) as Array<
		Record<string, unknown>
	>;
	if (aggregated.length > 0) {
		console.log(
			`\n--- aggregated_customer_entitlements (${aggregated.length}) ---`,
		);
		for (const ae of aggregated) {
			const entities = (ae.entities ?? {}) as Record<string, unknown>;
			console.log(
				`  ${ae.feature_id}: balance=${ae.balance}, adj=${ae.adjustment}, add=${ae.additional_balance}, rollover=${ae.rollover_balance}, entities.keys=${Object.keys(entities).length}`,
			);
		}
	}
	console.log();

	console.log("--- EXPLAIN (ANALYZE, BUFFERS) ---\n");
	const explainQuery = sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${query}`;
	const explainResult = await db.execute(explainQuery);

	const explainPath = resolve(outDir, "getFullSubject-explain.txt");
	const explainLines: string[] = [];
	for (const row of explainResult) {
		const line = (row as Record<string, unknown>)["QUERY PLAN"];
		if (typeof line === "string") explainLines.push(line);
	}
	writeFileSync(explainPath, explainLines.join("\n"));
	console.log(`EXPLAIN written to: ${explainPath}`);

	// Print just the top of the plan (total time, first ~20 lines) inline
	const head = explainLines.slice(0, 20);
	for (const line of head) console.log(line);
	const execLine = explainLines.find((line) => /Execution Time:/.test(line));
	const planLine = explainLines.find((line) => /Planning Time:/.test(line));
	if (planLine) console.log(planLine);
	if (execLine) console.log(execLine);

	process.exit(0);
};

await main();
