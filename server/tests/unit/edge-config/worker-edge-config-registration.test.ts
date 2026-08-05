import { expect, test } from "bun:test";
import path from "node:path";

test("workers register miscellaneous edge config before polling starts", async () => {
	const workersPath = path.resolve(import.meta.dir, "../../../src/workers.ts");
	const workersSource = await Bun.file(workersPath).text();
	const storeImport =
		'import "./internal/misc/edgeConfigs/miscellaneousEdgeConfig/miscellaneousEdgeConfigStore.js";';
	const storeImportIndex = workersSource.indexOf(storeImport);
	const pollingStartIndex = workersSource.indexOf(
		"await startAllEdgeConfigPolling({ logger });",
	);

	expect(storeImportIndex).toBeGreaterThanOrEqual(0);
	expect(pollingStartIndex).toBeGreaterThan(storeImportIndex);
});
