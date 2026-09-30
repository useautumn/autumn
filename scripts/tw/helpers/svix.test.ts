import { expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { needsSvix } from "./svix.ts";

const testsDir = join(import.meta.dir, "../../../server/tests");
const endpointsDir = join(testsDir, "integration/webhooks/endpoints");

test("routes every webhooks/endpoints integration file to the Svix shard", async () => {
	const files = (await readdir(endpointsDir)).filter((f) =>
		f.endsWith(".test.ts"),
	);
	expect(files.length).toBeGreaterThan(0);
	for (const file of files) {
		expect({ file, svix: await needsSvix(join(endpointsDir, file)) }).toEqual({
			file,
			svix: true,
		});
	}
});

test("still routes shared svixWebhookTestUtils importers to the Svix shard", async () => {
	expect(
		await needsSvix(
			join(
				testsDir,
				"integration/billing/autumn-webhooks/svix-message-tags.test.ts",
			),
		),
	).toBe(true);
});

test("keeps files without Svix imports on the normal pool", async () => {
	expect(
		await needsSvix(
			join(
				testsDir,
				"unit/webhooks/endpoints/compute-webhook-sync-changes.test.ts",
			),
		),
	).toBe(false);
});
