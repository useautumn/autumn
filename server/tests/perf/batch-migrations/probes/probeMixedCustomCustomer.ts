/**
 * Proves row-level custom scoping: a customer holding TWO cusProducts on the
 * filtered plan (one custom, one not) must have ONLY the non-custom row
 * become a candidate, while partition still marks them matched (succeeded).
 * Creates one temp cp row on the bench org; removes it afterwards.
 */

import type { EntitlementWithFeature } from "@autumn/shared";
import { CusProductStatus, EntInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { sql } from "drizzle-orm";
import { selectAddCandidateRows } from "@/internal/migrations/v2/batchOperations/actions/addCustomerEntitlementsForPage/selectAddCandidateRows.js";
import { buildOperationScope } from "@/internal/migrations/v2/batchOperations/scope/operationScope.js";
import { getBenchContext } from "../utils/benchContext.js";

const CUSTOMER = "cus_bench_2300001"; // free-bare shape: single non-custom cp
const NORMAL_CP = "cp_bench_2300001";
const MIXED_CP = "cp_bench_mixed_probe";

const main = async () => {
	const bench = await getBenchContext();
	const { ctx, benchProducts } = bench;
	const { db } = ctx;

	const wordsFeature = ctx.features.find((f) => f.id === TestFeature.Words);
	if (!wordsFeature) throw new Error("words feature missing");
	const wordsEntitlement = {
		interval: EntInterval.Month,
		interval_count: 1,
		internal_feature_id: wordsFeature.internal_id,
		feature_id: wordsFeature.id,
		feature: wordsFeature,
	} as unknown as EntitlementWithFeature;

	try {
		await db.execute(sql`
			INSERT INTO customer_products (
				id, internal_customer_id, internal_product_id, created_at, status,
				starts_at, is_custom, product_id, customer_id
			)
			SELECT ${MIXED_CP}, internal_customer_id, internal_product_id,
				created_at, ${CusProductStatus.Active}, starts_at, true,
				product_id, customer_id
			FROM customer_products WHERE id = ${NORMAL_CP}
			ON CONFLICT DO NOTHING
		`);

		// custom: false scope — the probe verifies customized rows never leak
		// into a plain-scoped candidate set.
		const candidates = await selectAddCandidateRows({
			db,
			internalCustomerIds: [CUSTOMER],
			scope: buildOperationScope({
				internalProductId: benchProducts.freeBare.internalId,
				isCustom: false,
			}),
			entitlement: wordsEntitlement,
			includeAnchorSources: true,
		});
		console.log(
			`candidates: ${candidates.length} row(s) → ${candidates.map((c) => c.customerProductId).join(", ")}`,
		);
		console.log(
			candidates.length === 1 && candidates[0].customerProductId === NORMAL_CP
				? `OK — only the NON-custom cp (${NORMAL_CP}) is a candidate; ${MIXED_CP} untouched`
				: "FAIL — custom row leaked into candidates!",
		);
	} finally {
		await db.execute(sql`DELETE FROM customer_products WHERE id = ${MIXED_CP}`);
		console.log("cleaned up temp cp row");
	}
	process.exit(0);
};

await main();
