import { expect, test } from "bun:test";
import path from "node:path";

test("workers register miscellaneous edge config before polling starts", async () => {
	const workersPath = path.resolve(import.meta.dir, "../../../src/workers.ts");
	const workersSource = await Bun.file(workersPath).text();
	const storeImport =
		'import "./internal/misc/miscellaneousEdgeConfig/miscellaneousEdgeConfigStore.js";';
	const storeImportIndex = workersSource.indexOf(storeImport);
	const pollingStartIndex = workersSource.indexOf(
		"await startAllEdgeConfigPolling({ logger });",
	);

	expect(storeImportIndex).toBeGreaterThanOrEqual(0);
	expect(pollingStartIndex).toBeGreaterThan(storeImportIndex);
});

test("all long-running processes register DB capacity before polling starts", async () => {
	const sourcePaths = [
		path.resolve(import.meta.dir, "../../../src/init.ts"),
		path.resolve(import.meta.dir, "../../../src/workers.ts"),
		path.resolve(import.meta.dir, "../../../src/cron.ts"),
	];

	for (const sourcePath of sourcePaths) {
		const source = await Bun.file(sourcePath).text();
		const storeImportIndex = source.indexOf(
			"internal/misc/dbCapacity/dbCapacityConfigStore.js",
		);
		const pollingStartIndex = source.indexOf(
			"startAllEdgeConfigPolling({ logger })",
		);

		expect(storeImportIndex).toBeGreaterThanOrEqual(0);
		expect(pollingStartIndex).toBeGreaterThan(storeImportIndex);
	}
});
