import { AppEnv, type NormalizedFullSubject, type SubjectQueryRow, normalizedToFullSubject, logFullSubject } from "@autumn/shared";
import { subjectQueryRowToNormalized, getFullSubjectQuery } from "@server/internal/customers/repos/getFullSubject/index.js";
import { sql } from "drizzle-orm";
import {
	initDrizzle,
	prodTestCustomerId,
	prodTestEntityId,
	prodTestOrgId,
} from "./experimentEnv";

// Run with: bun run experiments/normalizedSubjectDbExperiment.ts

const ORG_ID = prodTestOrgId;
const ENV = AppEnv.Live;
const CUSTOMER_ID = prodTestCustomerId;
const ENTITY_ID = prodTestEntityId;

const formatBytes = (bytes: number) => {
	if (bytes < 1024) return `${bytes} B`;
	const kb = bytes / 1024;
	if (kb < 1024) return `${kb.toFixed(2)} KB`;
	return `${(kb / 1024).toFixed(4)} MB`;
};

const printNormalizedStats = ({ normalized, label }: { normalized: NormalizedFullSubject; label: string }) => {
	const fullJson = JSON.stringify(normalized);
	const fullSize = Buffer.byteLength(fullJson, "utf8");

	const { customer_entitlements, ...subjectPart } = normalized;
	const subjectJson = JSON.stringify(subjectPart);
	const subjectSize = Buffer.byteLength(subjectJson, "utf8");

	const cesJson = JSON.stringify(customer_entitlements);
	const cesSize = Buffer.byteLength(cesJson, "utf8");
	const allRollovers = customer_entitlements.flatMap(
		(customerEntitlement) => customerEntitlement.rollovers ?? [],
	);
	const rolloversJson = JSON.stringify(allRollovers);
	const rolloversSize = Buffer.byteLength(rolloversJson, "utf8");

	const featureIds = new Set(customer_entitlements.map((ce) => ce.feature_id).filter(Boolean) as string[]);
	const cesByFeature: Record<string, number> = {};
	for (const featureId of featureIds) {
		cesByFeature[featureId] = customer_entitlements.filter((ce) => ce.feature_id === featureId).length;
	}

	console.log(`\n  --- ${label} ---`);
	console.log(`  Full NormalizedFullSubject:  ${formatBytes(fullSize)}`);
	console.log(`  Subject (no CEs):           ${formatBytes(subjectSize)}`);
	console.log(`  Customer entitlements:       ${formatBytes(cesSize)} (${customer_entitlements.length} CEs)`);
	console.log(`  Rollovers (inside CEs):      ${formatBytes(rolloversSize)} (${allRollovers.length})`);
	console.log(`  Flags (booleans):            ${Object.keys(normalized.flags).length}`);
	console.log(`  Customer products:           ${normalized.customer_products.length}`);
	console.log(`  Catalog products:            ${normalized.products.length}`);
	console.log(`  Catalog entitlements:        ${normalized.entitlements.length}`);
	console.log(`  Catalog prices:              ${normalized.prices.length}`);
	console.log(`  Metered features:            ${featureIds.size}`);
	for (const [featureId, count] of Object.entries(cesByFeature)) {
		console.log(`    ${featureId}: ${count} CEs`);
	}
};

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
	const query = getFullSubjectQuery({
		orgId: ORG_ID,
		env: ENV,
		customerId,
		entityId,
	});

	console.log(`\n=== ${label} ===`);
	console.log(`  orgId:      ${ORG_ID}`);
	console.log(`  customerId: ${customerId ?? "(none)"}`);
	console.log(`  entityId:   ${entityId ?? "(none)"}`);

	const queryStart = performance.now();
	const result = await db.execute(query);
	const queryMs = (performance.now() - queryStart).toFixed(2);

	if (!result || result.length === 0) {
		console.log(`  No rows returned. Query: ${queryMs}ms`);
		return;
	}

	const row = result[0] as unknown as SubjectQueryRow;
	console.log(`  Query:              ${queryMs}ms`);
	console.log(`  Rows returned:      ${result.length}`);

	const normalizeStart = performance.now();
	const normalized = subjectQueryRowToNormalized({ row });
	const normalizeMs = (performance.now() - normalizeStart).toFixed(2);
	console.log(`  Normalize:          ${normalizeMs}ms`);

	printNormalizedStats({ normalized, label: "Size Breakdown" });

	const hydrateStart = performance.now();
	const fullSubject = normalizedToFullSubject({ normalized });
	const hydrateMs = (performance.now() - hydrateStart).toFixed(2);

	const fullSubjectJson = JSON.stringify(fullSubject);
	const fullSubjectSize = Buffer.byteLength(fullSubjectJson, "utf8");

	console.log(`\n  --- Hydration ---`);
	console.log(`  normalizedToFullSubject():   ${hydrateMs}ms`);
	console.log(`  FullSubject JSON size:       ${formatBytes(fullSubjectSize)}`);
	console.log(`  FullSubject type:            ${fullSubject.subjectType}`);
	console.log(`  FullSubject customer_prods:  ${fullSubject.customer_products.length}`);
	console.log(`  FullSubject extra_cus_ents:  ${fullSubject.extra_customer_entitlements.length}`);

	console.log(`\n  --- FullSubject Summary ---`);
	logFullSubject({ fullSubject });
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
			label: "Path 3: Entity subject (entityId only)",
			entityId: ENTITY_ID,
		});
	} finally {
		await client.end();
	}
}

main().catch(console.error);
