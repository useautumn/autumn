/**
 * A Mobbin export died at ~2.6M of 3.07M rows on "Query read timeout": the walk
 * read through dbReplica, whose query_timeout is 5s because it serves
 * interactive API reads. dbReplicaSlow exists at 60s for batch work.
 *
 * Red (before):  the export's streaming reads import dbReplica.
 * Green (after): they import dbReplicaSlow; only the one-off reconcile read,
 *                which is not part of the walk, stays on the fast pool.
 */

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const EXPORTS_DIR = join(
	import.meta.dir,
	"../../../../src/internal/customers/exports",
);

const readsPool = ({ file }: { file: string }) => {
	const source = readFileSync(join(EXPORTS_DIR, file), "utf8");
	if (source.includes("dbReplicaSlow")) return "slow";
	if (source.includes("dbReplica")) return "fast";
	return "none";
};

/** Every read the walk repeats, once per page, for the life of the export. */
const STREAMING_READS = [
	"workflows/upload/walkCustomerExportPages.ts",
	"workflows/upload/createCustomerExportRowStream.ts",
	"workflows/upload/uploadCustomerExportCsv.ts",
	"verify/setupBillingVerifySweep.ts",
	"verify/filterBillingVerifyCandidates.ts",
];

describe("customer export replica pool", () => {
	it("streams every page through the pool budgeted for batch work", () => {
		const pools = STREAMING_READS.map((file) => [file, readsPool({ file })]);

		expect(pools).toEqual(STREAMING_READS.map((file) => [file, "slow"]));
	});

	it("leaves the one-off reconcile read on the interactive pool", () => {
		expect(
			readsPool({ file: "workflows/setup/reconcileUploadedExport.ts" }),
		).toBe("fast");
	});
});
