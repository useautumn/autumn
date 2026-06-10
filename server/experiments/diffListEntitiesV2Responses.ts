// Run with `CHECK_ORG_ID=... CHECK_CUSTOMER_ID=... CHECK_LIMIT=200 bun run experiments/diffListEntitiesV2Responses.ts`
import { AppEnv, type CusProductStatus, type SubjectQueryRow } from "@autumn/shared";
import { sql } from "drizzle-orm";
import { initDrizzle } from "../src/db/initDrizzle.js";
import { RELEVANT_STATUSES } from "../src/internal/customers/cusProducts/CusProductService.js";
import { getFullSubjectRowsQuery } from "../src/internal/customers/repos/getFullSubject/getFullSubjectRowsQuery.js";
import { mergeEntityAndCustomerSubjectRows } from "../src/internal/customers/repos/getFullSubject/mergeEntityAndCustomerSubjectRows.js";
import { getCursorPaginatedEntitySubjectsQuery } from "../src/internal/entities/repos/cursorListEntitiesQuery.js";
import { getCustomerLevelSubjectRowsQuery } from "../src/internal/entities/repos/customerLevelSubjectsQuery.js";

const ORG_ID = process.env.CHECK_ORG_ID as string;
const CUSTOMER_ID = process.env.CHECK_CUSTOMER_ID as string;
const LIMIT = Number(process.env.CHECK_LIMIT || 200);
const ENV = AppEnv.Live;

const getCombinedQuery = ({ inStatuses }: { inStatuses: CusProductStatus[] }) => {
	const customerFilter = CUSTOMER_ID ? sql`AND c.id = ${CUSTOMER_ID}` : sql``;
	const leadingCtes = sql`
		WITH entity_records AS (
			SELECT e.*
			FROM entities e
			JOIN customers c ON c.internal_id = e.internal_customer_id
			WHERE e.org_id = ${ORG_ID} AND e.env = ${ENV}
				AND c.org_id = ${ORG_ID} AND c.env = ${ENV}
				${customerFilter}
			ORDER BY e.created_at DESC, e.id DESC
			LIMIT ${LIMIT + 1}
		),
		subject_records AS (
			SELECT er.internal_id AS subject_key, er.internal_customer_id, er.internal_id AS internal_entity_id,
				ROW_NUMBER() OVER (ORDER BY er.created_at DESC, er.id DESC) AS subject_order
			FROM entity_records er
		)
	`;
	return getFullSubjectRowsQuery({
		leadingCtes,
		inStatuses,
		includeInvoices: false,
		includeEntityAggregations: false,
	});
};

const stableStringify = (value: unknown): string => {
	if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
	if (value && typeof value === "object") {
		const entries = Object.entries(value as Record<string, unknown>)
			.filter(([, v]) => v !== undefined)
			.sort(([a], [b]) => (a < b ? -1 : 1))
			.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
		return `{${entries.join(",")}}`;
	}
	return JSON.stringify(value);
};

const sortByKey = (rows: Record<string, unknown>[], key: string) =>
	[...rows].sort((a, b) => (String(a[key]) < String(b[key]) ? -1 : 1));

// order-insensitive fields: combined query has no deterministic ORDER BY here
const UNORDERED_FIELDS: Record<string, string> = {
	customer_entitlements: "id",
	customer_prices: "id",
	subscriptions: "stripe_id",
	entitlements: "id",
	rollovers: "id",
	replaceables: "id",
};
const ORDERED_FIELDS = [
	"customer",
	"entity",
	"customer_products",
	"extra_customer_entitlements",
	"products",
	"prices",
	"free_trials",
];

const main = async () => {
	const { db } = initDrizzle();
	const inStatuses = RELEVANT_STATUSES;

	const combinedRows = (await db.execute(
		getCombinedQuery({ inStatuses }),
	)) as unknown as SubjectQueryRow[];

	const entityRows = (await db.execute(
		getCursorPaginatedEntitySubjectsQuery({
			orgId: ORG_ID,
			env: ENV,
			limit: LIMIT,
			cursor: null,
			inStatuses,
			customerId: CUSTOMER_ID || undefined,
		}),
	)) as unknown as SubjectQueryRow[];

	const internalCustomerIds = [
		...new Set(entityRows.map((row) => row.customer.internal_id)),
	];
	const customerRows =
		internalCustomerIds.length > 0
			? ((await db.execute(
					getCustomerLevelSubjectRowsQuery({
						orgId: ORG_ID,
						env: ENV,
						internalCustomerIds,
						inStatuses,
					}),
				)) as unknown as SubjectQueryRow[])
			: [];
	const customerRowsByInternalId = new Map(
		customerRows.map((row) => [row.customer.internal_id, row]),
	);

	const mergedRows = entityRows.map((entityRow) =>
		mergeEntityAndCustomerSubjectRows({
			entityRow,
			customerRow: customerRowsByInternalId.get(entityRow.customer.internal_id),
		}),
	);

	console.log(`combined: ${combinedRows.length} rows, merged: ${mergedRows.length} rows`);
	if (combinedRows.length !== mergedRows.length) throw new Error("row count mismatch");

	let mismatches = 0;
	for (let i = 0; i < combinedRows.length; i++) {
		const combined = combinedRows[i] as unknown as Record<string, unknown>;
		const merged = mergedRows[i] as unknown as Record<string, unknown>;

		for (const field of ORDERED_FIELDS) {
			const left = stableStringify(combined[field] ?? null);
			const right = stableStringify(merged[field] ?? null);
			if (left !== right) {
				mismatches++;
				console.log(`row ${i} entity=${(combined.entity as { id?: string })?.id} ORDERED field "${field}" differs`);
				if (mismatches <= 3) {
					console.log(`  combined: ${left.slice(0, 500)}`);
					console.log(`  merged:   ${right.slice(0, 500)}`);
				}
			}
		}
		for (const [field, key] of Object.entries(UNORDERED_FIELDS)) {
			const left = stableStringify(sortByKey((combined[field] as Record<string, unknown>[]) ?? [], key));
			const right = stableStringify(sortByKey((merged[field] as Record<string, unknown>[]) ?? [], key));
			if (left !== right) {
				mismatches++;
				console.log(`row ${i} entity=${(combined.entity as { id?: string })?.id} UNORDERED field "${field}" differs`);
				if (mismatches <= 3) {
					console.log(`  combined: ${left.slice(0, 500)}`);
					console.log(`  merged:   ${right.slice(0, 500)}`);
				}
			}
		}
	}

	console.log(mismatches === 0 ? "ALL ROWS IDENTICAL" : `${mismatches} field mismatches`);
	process.exit(mismatches === 0 ? 0 : 1);
};

await main();
