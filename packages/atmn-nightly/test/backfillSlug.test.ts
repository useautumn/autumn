/**
 * The slug travels with the id: a plan fixture that stated neither gets both
 * written on its first push, once, so a nuke-and-repush keeps its names.
 */

import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { backfillSummary, runPush } from "../src/actions/push";

const dir = `${import.meta.dir}/.tmp/backfill-slug`;

const config = [
	'import { plan } from "../../../src/generated/plans";',
	'import { atmn } from "../../../src/generated/wire";',
	"",
	"export default atmn({",
	"\tplans: [",
	'\t\tplan({ planId: "pro", name: "Pro", price: { amount: 49, interval: "month" } }),',
	"\t],",
	"});",
	"",
].join("\n");

const client = {
	previewUpdate: async () => ({
		features: [],
		plans: [
			{
				planId: "pro",
				version: 1,
				versionSlug: "v1",
				active: true,
				action: "create",
				state: {},
			},
		],
	}),
	// Plan rows ride the top level of the apply response, results carry actions.
	update: async () => ({
		results: { features: [], plans: [{ id: "pro", action: "create" }] },
		plans: [{ id: "pro", internalId: "prod_1", version: 1, versionSlug: "v1" }],
		migrations: [],
	}),
	get: async () => ({ features: [], plans: [] }),
};

test("a first push writes internalId and versionSlug into the fixture, once", async () => {
	rmSync(dir, { recursive: true, force: true });
	mkdirSync(dir, { recursive: true });
	writeFileSync(`${dir}/autumn.config.ts`, config, "utf8");
	const printed: string[] = [];
	// biome-ignore lint/suspicious/noExplicitAny: a fake client
	await runPush({
		client: client as any,
		cwd: dir,
		write: (t) => printed.push(t),
	});

	const after = readFileSync(`${dir}/autumn.config.ts`, "utf8");
	expect(after).toContain(
		'plan({ internalId: "prod_1", planId: "pro", name: "Pro", price: { amount: 49, interval: "month" }, versionSlug: "v1" })',
	);
	expect(printed.join("")).toContain(
		"Wrote internalId into 1 fixture and versionSlug into 1 fixture.",
	);

	// biome-ignore lint/suspicious/noExplicitAny: a fake client
	await runPush({ client: client as any, cwd: dir, write: () => {} });
	expect(readFileSync(`${dir}/autumn.config.ts`, "utf8")).toBe(after);
});

/** The two sets overlap only sometimes: one fixture may take just the slug and
 * another just the id, and the summary must not imply both got both. */
test("the summary counts each field separately", () => {
	expect(backfillSummary({ backfilled: ["pro"], slugged: ["free"] })).toBe(
		"Wrote internalId into 1 fixture and versionSlug into 1 fixture.\n",
	);
	expect(backfillSummary({ backfilled: ["pro", "free"], slugged: [] })).toBe(
		"Wrote internalId into 2 fixtures.\n",
	);
	expect(backfillSummary({ backfilled: [], slugged: ["pro"] })).toBe(
		"Wrote versionSlug into 1 fixture.\n",
	);
});
