import { expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Glob } from "bun";
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

test("routes atmn CLI crud and scenario files to the Svix shard", async () => {
	for (const file of [
		"integration/atmn/crud/plans/free-no-items.test.ts",
		"integration/atmn/scenarios/pull/empty-dir.test.ts",
	]) {
		expect({ file, svix: await needsSvix(join(testsDir, file)) }).toEqual({
			file,
			svix: true,
		});
	}
});

test("routes every runnable atmn integration file to the Svix shard", async () => {
	const atmnDir = join(testsDir, "integration/atmn");
	const files = await Array.fromAsync(
		new Glob("**/*.test.ts").scan({ cwd: atmnDir }),
	);
	const runnable = [];
	for (const file of files) {
		const source = await readFile(join(atmnDir, file), "utf8");
		if (/^\s*test(\.concurrent)?\(/m.test(source)) {
			runnable.push(file);
		}
	}
	expect(runnable.length).toBeGreaterThan(100);
	for (const file of runnable) {
		expect({ file, svix: await needsSvix(join(atmnDir, file)) }).toEqual({
			file,
			svix: true,
		});
	}
});

test("keeps non-atmn billing files on the normal pool", async () => {
	expect(
		await needsSvix(
			join(testsDir, "integration/billing/attach/attach-metadata.test.ts"),
		),
	).toBe(false);
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
