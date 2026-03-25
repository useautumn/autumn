import { AppEnv, type FullCustomer } from "@autumn/shared";
import { initDrizzle } from "@server/db/initDrizzle.js";
import { RELEVANT_STATUSES } from "@server/internal/customers/cusProducts/CusProductService.js";
import { getFullCusQuery } from "@server/internal/customers/getFullCusQuery.js";
import type { SubjectCoreRow } from "@server/internal/customers/repos/getFullCustomerV2.js";
import { resultToFullCustomer } from "@server/internal/customers/repos/getFullCustomerV2/resultToFullCustomer.js";
import { getSubjectCoreQuery } from "@server/internal/customers/repos/sql/getSubjectCoreQuery.js";
import { loadLocalEnv } from "@server/utils/envUtils.js";
import { prodTestCustomerId, prodTestOrgId } from "./experimentEnv";

loadLocalEnv();

const ORG_ID = prodTestOrgId;
const ENV = AppEnv.Live;
const CUSTOMER_ID = prodTestCustomerId;

const jsonSize = ({ data }: { data: unknown }) => {
	const json = JSON.stringify(data);
	const bytes = Buffer.byteLength(json, "utf8");
	return { bytes, kb: (bytes / 1024).toFixed(2) };
};

async function main() {
	const { db, client } = initDrizzle({ maxConnections: 2 });

	try {
		console.log(`Comparing: ${CUSTOMER_ID} (org: ${ORG_ID}, env: ${ENV})\n`);

		// --- V1: getFullCusQuery (CusService.getFull path) ---
		const v1Query = getFullCusQuery(
			CUSTOMER_ID,
			ORG_ID,
			ENV,
			RELEVANT_STATUSES,
			false,
			false,
			false,
			false,
			false,
		);

		const v1Start = performance.now();
		const v1Result = await db.execute(v1Query);
		const v1QueryMs = (performance.now() - v1Start).toFixed(2);

		let v1Size = { bytes: 0, kb: "0" };
		if (v1Result && v1Result.length > 0) {
			const v1Data = v1Result[0] as FullCustomer;
			v1Size = jsonSize({ data: v1Data });
		}

		// --- V2: getSubjectCoreQuery + resultToFullCustomer ---
		const v2Query = getSubjectCoreQuery({
			orgId: ORG_ID,
			env: ENV,
			customerId: CUSTOMER_ID,
		});

		const v2QueryStart = performance.now();
		const v2Result = await db.execute(v2Query);
		const v2QueryMs = (performance.now() - v2QueryStart).toFixed(2);

		let v2HydrateMs = "0";
		let v2Size = { bytes: 0, kb: "0" };
		if (v2Result && v2Result.length > 0) {
			const row = v2Result[0] as unknown as SubjectCoreRow;
			const hydrateStart = performance.now();
			const fullCustomer = resultToFullCustomer({ row });
			v2HydrateMs = (performance.now() - hydrateStart).toFixed(2);
			v2Size = jsonSize({ data: fullCustomer });
		}

		// --- Results ---
		console.log("=== V1 (getFullCusQuery) ===");
		console.log(`  Query:    ${v1QueryMs}ms`);
		console.log(`  Size:     ${v1Size.kb} KB (${v1Size.bytes} bytes)`);

		console.log("\n=== V2 (getSubjectCoreQuery + hydrate) ===");
		console.log(`  Query:    ${v2QueryMs}ms`);
		console.log(`  Hydrate:  ${v2HydrateMs}ms`);
		console.log(`  Size:     ${v2Size.kb} KB (${v2Size.bytes} bytes)`);

		console.log("\n=== Comparison ===");
		const queryDiff = (Number(v1QueryMs) - Number(v2QueryMs)).toFixed(2);
		const sizeDiff = v1Size.bytes - v2Size.bytes;
		const sizePct =
			v1Size.bytes > 0
				? ((sizeDiff / v1Size.bytes) * 100).toFixed(1)
				: "N/A";
		console.log(
			`  Query:    V1 is ${queryDiff}ms ${Number(queryDiff) > 0 ? "slower" : "faster"}`,
		);
		console.log(
			`  Size:     V2 is ${(sizeDiff / 1024).toFixed(2)} KB ${sizeDiff > 0 ? "smaller" : "larger"} (${sizePct}%)`,
		);
	} finally {
		await client.end();
	}
}

main().catch(console.error);
