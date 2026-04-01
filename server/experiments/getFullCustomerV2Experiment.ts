import { AppEnv } from "@autumn/shared";
import { initDrizzle } from "@server/db/initDrizzle.js";
import type { SubjectCoreRow } from "@server/internal/customers/repos/getFullSubject.js";
import { resultToFullCustomer } from "@server/internal/customers/repos/getFullCustomerV2/resultToFullCustomer.js";
import { getSubjectCoreQuery } from "@server/internal/customers/repos/sql/getSubjectCoreQuery.js";
import { loadLocalEnv } from "@server/utils/envUtils.js";
import { logFullCustomer } from "@shared/utils/cusUtils/fullCusUtils/logFullCustomer.js";
import { prodTestCustomerId, prodTestOrgId } from "./experimentEnv";

loadLocalEnv();

const ORG_ID = prodTestOrgId;
const ENV = AppEnv.Live;
const CUSTOMER_ID = prodTestCustomerId;

async function main() {
	const { db, client } = initDrizzle({ maxConnections: 2 });

	try {
		const query = getSubjectCoreQuery({
			orgId: ORG_ID,
			env: ENV,
			customerId: CUSTOMER_ID,
		});

		console.log("Fetching full customer V2...");
		console.log(`  orgId:      ${ORG_ID}`);
		console.log(`  env:        ${ENV}`);
		console.log(`  customerId: ${CUSTOMER_ID}`);
		console.log("");

		const start = performance.now();
		const result = await db.execute(query);
		const queryElapsed = (performance.now() - start).toFixed(2);

		if (!result || result.length === 0) {
			console.log("No customer found.");
			return;
		}

		const row = result[0] as unknown as SubjectCoreRow;
		console.log(`Query completed in ${queryElapsed}ms`);

		const hydrateStart = performance.now();
		const fullCustomer = resultToFullCustomer({ row });
		const hydrateElapsed = (performance.now() - hydrateStart).toFixed(2);
		console.log(`Hydration completed in ${hydrateElapsed}ms`);

		const jsonOutput = JSON.stringify(fullCustomer);
		const sizeBytes = Buffer.byteLength(jsonOutput, "utf8");
		const sizeKb = (sizeBytes / 1024).toFixed(2);
		console.log(`JSON size: ${sizeKb} KB (${sizeBytes} bytes)\n`);

		logFullCustomer({ fullCustomer });
	} finally {
		await client.end();
	}
}

main().catch(console.error);
