/**
 * After a push applies, the minted internal ids land in the fixtures that
 * created them — the config-side half of addressing rows by identity.
 */

import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { runPush } from "../src/actions/push";

const dir = `${import.meta.dir}/.tmp/backfill`;

const config = [
	'import { feature } from "../../../src/generated/features";',
	'import { atmn } from "../../../src/generated/wire";',
	'import { seats } from "./features";',
	"",
	"export default atmn({",
	"\tfeatures: [",
	"\t\tseats,",
	'\t\tfeature({ featureId: "messages", name: "Messages", type: "metered", consumable: true }),',
	"\t],",
	"});",
	"",
].join("\n");

const featuresFile = [
	'import { feature } from "../../../src/generated/features";',
	"",
	"export const seats = feature({",
	'\tfeatureId: "seats",',
	'\tname: "Seats",',
	'\ttype: "boolean",',
	"});",
	"",
].join("\n");

const clientReturning = (results: Record<string, unknown>) => ({
	previewUpdate: async () => ({
		features: [
			{ featureId: "seats", action: "create" },
			{ featureId: "messages", action: "create" },
		],
		plans: [],
	}),
	update: async () => ({ results, migrations: [] }),
	get: async () => ({ features: [], plans: [] }),
});

test("a push writes the minted internalId into each created fixture, once", async () => {
	rmSync(dir, { recursive: true, force: true });
	mkdirSync(dir, { recursive: true });
	writeFileSync(`${dir}/autumn.config.ts`, config, "utf8");
	writeFileSync(`${dir}/features.ts`, featuresFile, "utf8");
	const client = clientReturning({
		features: [
			{ id: "seats", internalId: "fe_seats", action: "create" },
			{ id: "messages", internalId: "fe_messages", action: "create" },
		],
		plans: [],
	});
	const printed: string[] = [];
	// biome-ignore lint/suspicious/noExplicitAny: a fake client
	await runPush({
		client: client as any,
		cwd: dir,
		write: (text) => printed.push(text),
	});

	expect(readFileSync(`${dir}/features.ts`, "utf8")).toContain(
		'feature({\n\tinternalId: "fe_seats",\n\tfeatureId: "seats",',
	);
	expect(readFileSync(`${dir}/autumn.config.ts`, "utf8")).toContain(
		'feature({ internalId: "fe_messages", featureId: "messages",',
	);
	expect(printed.join("")).toContain("Wrote internalId into 2 fixtures.");

	// A second apply reporting the same creates must not write a second id.
	const before = readFileSync(`${dir}/features.ts`, "utf8");
	// biome-ignore lint/suspicious/noExplicitAny: a fake client
	await runPush({ client: client as any, cwd: dir, write: () => {} });
	expect(readFileSync(`${dir}/features.ts`, "utf8")).toBe(before);
});
