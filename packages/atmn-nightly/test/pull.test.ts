import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runPull } from "../src/actions/pull";
import type { AutumnClient } from "../src/generated/client";

/**
 * Pull against a fake client: preview and catalog responses are canned
 * camelCase objects shaped like the generated response types, so the whole
 * reversal runs without a server.
 */

const tempDir = ({ name }: { name: string }): string => {
	const dir = join(import.meta.dir, ".tmp", `pull-${name}`);
	mkdirSync(dir, { recursive: true });
	return dir;
};

const writeConfig = ({ dir, text }: { dir: string; text: string }): string => {
	const path = join(dir, "autumn.config.ts");
	writeFileSync(path, text, "utf8");
	return path;
};

const fakeClient = ({
	preview,
	catalog,
}: {
	preview: unknown;
	catalog: unknown;
}): AutumnClient =>
	({
		previewUpdate: async () => preview,
		update: async () => ({}),
		get: async () => catalog,
	}) as unknown as AutumnClient;

const seatsRow = {
	id: "seats",
	name: "Seats",
	type: "boolean",
	consumable: false,
	archived: false,
};

const messagesRow = {
	id: "messages",
	name: "Messages",
	type: "metered",
	consumable: true,
	archived: false,
};

test("a delete-action appends the server row into an inline array", async () => {
	const dir = tempDir({ name: "delete-append" });
	const path = writeConfig({
		dir,
		text: [
			'import { atmn } from "../../../src/generated/wire";',
			'import { feature } from "../../../src/generated/features";',
			"",
			"export default atmn({",
			"\tfeatures: [],",
			"});",
			"",
		].join("\n"),
	});
	let output = "";
	const result = await runPull({
		client: fakeClient({
			preview: { features: [{ featureId: "messages", action: "delete" }] },
			catalog: { features: [messagesRow], plans: [] },
		}),
		cwd: dir,
		write: (text) => {
			output += text;
		},
	});

	expect(result).toEqual({
		configPath: path,
		appended: ["messages"],
		replaced: [],
		deleted: [],
	});
	expect(output).toBe("+ messages\nPulled.\n");
	expect(readFileSync(path, "utf8")).toBe(
		[
			'import { atmn } from "../../../src/generated/wire";',
			'import { feature } from "../../../src/generated/features";',
			"",
			"export default atmn({",
			"\tfeatures: [",
			"\t\tfeature({",
			'\t\t\tname: "Messages",',
			'\t\t\ttype: "metered",',
			"\t\t\tconsumable: true,",
			'\t\t\tfeatureId: "messages",',
			"\t\t}),",
			"\t],",
			"});",
			"",
		].join("\n"),
	);

	const module = await import(`${path}?v=pulled`);
	const wire = module.default as { features: Record<string, unknown>[] };
	expect(wire.features).toHaveLength(1);
	expect(wire.features[0]).toEqual({
		name: "Messages",
		type: "metered",
		consumable: true,
		feature_id: "messages",
	});
});

test("an update-action replaces an inline fixture, leaving the rest byte-identical", async () => {
	const dir = tempDir({ name: "update-inline" });
	const path = writeConfig({
		dir,
		text: [
			'import { atmn } from "../../../src/generated/wire";',
			'import { feature } from "../../../src/generated/features";',
			"",
			"// a comment that must survive",
			"export default atmn({",
			"\tfeatures: [",
			"\t\tfeature({",
			'\t\t\tfeatureId: "seats",',
			'\t\t\tname: "Seats",',
			'\t\t\ttype: "boolean",',
			"\t\t}),",
			"\t\tfeature({",
			'\t\t\tfeatureId: "messages",',
			'\t\t\tname: "Messages",',
			'\t\t\ttype: "metered",',
			"\t\t\tconsumable: false,",
			"\t\t}),",
			"\t],",
			"});",
			"",
		].join("\n"),
	});
	let output = "";
	const result = await runPull({
		client: fakeClient({
			preview: { features: [{ featureId: "messages", action: "update" }] },
			catalog: { features: [seatsRow, messagesRow], plans: [] },
		}),
		cwd: dir,
		write: (text) => {
			output += text;
		},
	});

	expect(result.replaced).toEqual(["messages"]);
	expect(result.appended).toEqual([]);
	expect(result.deleted).toEqual([]);
	expect(output).toBe("~ messages\nPulled.\n");
	expect(readFileSync(path, "utf8")).toBe(
		[
			'import { atmn } from "../../../src/generated/wire";',
			'import { feature } from "../../../src/generated/features";',
			"",
			"// a comment that must survive",
			"export default atmn({",
			"\tfeatures: [",
			"\t\tfeature({",
			'\t\t\tfeatureId: "seats",',
			'\t\t\tname: "Seats",',
			'\t\t\ttype: "boolean",',
			"\t\t}),",
			"\t\tfeature({",
			'\t\t\tname: "Messages",',
			'\t\t\ttype: "metered",',
			"\t\t\tconsumable: true,",
			'\t\t\tfeatureId: "messages",',
			"\t\t}),",
			"\t],",
			"});",
			"",
		].join("\n"),
	);

	const module = await import(`${path}?v=pulled`);
	const wire = module.default as { features: Record<string, unknown>[] };
	expect(wire.features).toHaveLength(2);
	expect(wire.features[0]).toEqual({
		feature_id: "seats",
		name: "Seats",
		type: "boolean",
	});
	expect(wire.features[1]).toEqual({
		name: "Messages",
		type: "metered",
		consumable: true,
		feature_id: "messages",
	});
});

test("an update-action replaces an exported fixture in its own file, not the config", async () => {
	const dir = tempDir({ name: "update-exported" });
	const featuresPath = join(dir, "features.ts");
	writeFileSync(
		featuresPath,
		[
			'import { feature } from "../../../src/generated/features";',
			"",
			"export const seats = feature({",
			'\tfeatureId: "seats",',
			'\tname: "Seats",',
			'\ttype: "boolean",',
			"});",
			"",
		].join("\n"),
		"utf8",
	);
	const path = writeConfig({
		dir,
		text: [
			'import { atmn } from "../../../src/generated/wire";',
			'import { seats } from "./features";',
			"",
			"export default atmn({",
			"\tfeatures: [seats],",
			"});",
			"",
		].join("\n"),
	});
	const configBefore = readFileSync(path, "utf8");
	let output = "";
	const result = await runPull({
		client: fakeClient({
			preview: { features: [{ featureId: "seats", action: "update" }] },
			catalog: { features: [seatsRow], plans: [] },
		}),
		cwd: dir,
		write: (text) => {
			output += text;
		},
	});

	expect(result.replaced).toEqual(["seats"]);
	expect(output).toBe("~ seats\nPulled.\n");
	expect(readFileSync(path, "utf8")).toBe(configBefore);
	expect(readFileSync(featuresPath, "utf8")).toBe(
		[
			'import { feature } from "../../../src/generated/features";',
			"",
			"export const seats = feature({",
			'\tname: "Seats",',
			'\ttype: "boolean",',
			"\tconsumable: false,",
			'\tfeatureId: "seats",',
			"});",
			"",
		].join("\n"),
	);

	const module = await import(`${featuresPath}?v=pulled`);
	const seats = module.seats as Record<string, unknown>;
	expect(seats.featureId).toBe("seats");
	expect(seats.consumable).toBe(false);
});

test("a create-action removes an inline fixture with its comma", async () => {
	const dir = tempDir({ name: "create-inline" });
	const path = writeConfig({
		dir,
		text: [
			'import { atmn } from "../../../src/generated/wire";',
			'import { feature } from "../../../src/generated/features";',
			"",
			"export default atmn({",
			"\tfeatures: [",
			"\t\tfeature({",
			'\t\t\tfeatureId: "seats",',
			'\t\t\tname: "Seats",',
			'\t\t\ttype: "boolean",',
			"\t\t}),",
			"\t\tfeature({",
			'\t\t\tfeatureId: "messages",',
			'\t\t\tname: "Messages",',
			'\t\t\ttype: "metered",',
			"\t\t\tconsumable: true,",
			"\t\t}),",
			"\t],",
			"});",
			"",
		].join("\n"),
	});
	let output = "";
	const result = await runPull({
		client: fakeClient({
			preview: {
				features: [
					{ featureId: "seats", action: "none" },
					{ featureId: "messages", action: "create" },
				],
			},
			catalog: { features: [seatsRow], plans: [] },
		}),
		cwd: dir,
		write: (text) => {
			output += text;
		},
	});

	expect(result.deleted).toEqual(["messages"]);
	expect(output).toBe("- messages\nPulled.\n");
	expect(readFileSync(path, "utf8")).toBe(
		[
			'import { atmn } from "../../../src/generated/wire";',
			'import { feature } from "../../../src/generated/features";',
			"",
			"export default atmn({",
			"\tfeatures: [",
			"\t\tfeature({",
			'\t\t\tfeatureId: "seats",',
			'\t\t\tname: "Seats",',
			'\t\t\ttype: "boolean",',
			"\t\t}),",
			"\t],",
			"});",
			"",
		].join("\n"),
	);

	const module = await import(`${path}?v=pulled`);
	const wire = module.default as { features: Record<string, unknown>[] };
	expect(wire.features).toHaveLength(1);
	expect(wire.features[0]).toEqual({
		feature_id: "seats",
		name: "Seats",
		type: "boolean",
	});
});

test("a create-action removes the export, the import and the array entry", async () => {
	const dir = tempDir({ name: "create-exported" });
	const featuresPath = join(dir, "features.ts");
	writeFileSync(
		featuresPath,
		[
			'import { feature } from "../../../src/generated/features";',
			"",
			"export const seats = feature({",
			'\tfeatureId: "seats",',
			'\tname: "Seats",',
			'\ttype: "boolean",',
			"});",
			"",
			"export const messages = feature({",
			'\tfeatureId: "messages",',
			'\tname: "Messages",',
			'\ttype: "metered",',
			"\tconsumable: true,",
			"});",
			"",
		].join("\n"),
		"utf8",
	);
	const path = writeConfig({
		dir,
		text: [
			'import { atmn } from "../../../src/generated/wire";',
			'import { messages, seats } from "./features";',
			"",
			"export default atmn({",
			"\tfeatures: [seats, messages],",
			"});",
			"",
		].join("\n"),
	});
	let output = "";
	const result = await runPull({
		client: fakeClient({
			preview: { features: [{ featureId: "messages", action: "create" }] },
			catalog: { features: [], plans: [] },
		}),
		cwd: dir,
		write: (text) => {
			output += text;
		},
	});

	expect(result.deleted).toEqual(["messages"]);
	expect(output).toBe("- messages\nPulled.\n");
	expect(readFileSync(featuresPath, "utf8")).toBe(
		[
			'import { feature } from "../../../src/generated/features";',
			"",
			"export const seats = feature({",
			'\tfeatureId: "seats",',
			'\tname: "Seats",',
			'\ttype: "boolean",',
			"});",
			"",
			"",
		].join("\n"),
	);
	expect(readFileSync(path, "utf8")).toBe(
		[
			'import { atmn } from "../../../src/generated/wire";',
			// removeSpecifierEdit drops the specifier plus one comma, so the
			// remaining one keeps its original leading space.
			'import { seats } from "./features";',
			"",
			"export default atmn({",
			"\tfeatures: [seats],",
			"});",
			"",
		].join("\n"),
	);

	const module = await import(`${path}?v=pulled`);
	const wire = module.default as { features: Record<string, unknown>[] };
	expect(wire.features).toHaveLength(1);
	expect(wire.features[0]).toEqual({
		feature_id: "seats",
		name: "Seats",
		type: "boolean",
	});
});

test("a none-action changes nothing and reports nothing to pull", async () => {
	const dir = tempDir({ name: "none" });
	const path = writeConfig({
		dir,
		text: [
			'import { atmn } from "../../../src/generated/wire";',
			'import { feature } from "../../../src/generated/features";',
			"",
			"export default atmn({",
			"\tfeatures: [",
			"\t\tfeature({",
			'\t\t\tfeatureId: "seats",',
			'\t\t\tname: "Seats",',
			'\t\t\ttype: "boolean",',
			"\t\t}),",
			"\t],",
			"});",
			"",
		].join("\n"),
	});
	const before = readFileSync(path, "utf8");
	let output = "";
	const result = await runPull({
		client: fakeClient({
			preview: { features: [{ featureId: "seats", action: "none" }] },
			catalog: { features: [seatsRow], plans: [] },
		}),
		cwd: dir,
		write: (text) => {
			output += text;
		},
	});

	expect(result.appended).toEqual([]);
	expect(result.replaced).toEqual([]);
	expect(result.deleted).toEqual([]);
	expect(output).toBe("Nothing to pull.\n");
	expect(readFileSync(path, "utf8")).toBe(before);
});

test("includeMappings drops processors by default and keeps them when set", async () => {
	const row = {
		...messagesRow,
		id: "api_calls",
		name: "API Calls",
		processors: { stripe: { productId: "prod_123", meterId: "meter_456" } },
	};
	const preview = { features: [{ featureId: "api_calls", action: "delete" }] };
	const catalog = { features: [row], plans: [] };

	const offDir = tempDir({ name: "mappings-off" });
	const offPath = writeConfig({
		dir: offDir,
		text: [
			'import { atmn } from "../../../src/generated/wire";',
			'import { feature } from "../../../src/generated/features";',
			"",
			"export default atmn({",
			"\tfeatures: [],",
			"});",
			"",
		].join("\n"),
	});
	await runPull({
		client: fakeClient({ preview, catalog }),
		cwd: offDir,
		write: () => {},
	});
	const offText = readFileSync(offPath, "utf8");
	expect(offText).not.toContain("processors");
	const offModule = await import(`${offPath}?v=pulled`);
	const offWire = offModule.default as {
		features: Record<string, unknown>[];
	};
	expect(offWire.features[0]).toEqual({
		name: "API Calls",
		type: "metered",
		consumable: true,
		feature_id: "api_calls",
	});

	const onDir = tempDir({ name: "mappings-on" });
	const onPath = writeConfig({
		dir: onDir,
		text: [
			'import { atmn } from "../../../src/generated/wire";',
			'import { feature } from "../../../src/generated/features";',
			"",
			"export default atmn({",
			"\tfeatures: [],",
			"});",
			"",
		].join("\n"),
	});
	await runPull({
		client: fakeClient({ preview, catalog }),
		cwd: onDir,
		includeMappings: true,
		write: () => {},
	});
	const onText = readFileSync(onPath, "utf8");
	expect(onText).toContain(
		[
			"\t\t\tprocessors: {",
			"\t\t\t\tstripe: {",
			'\t\t\t\t\tproductId: "prod_123",',
			'\t\t\t\t\tmeterId: "meter_456",',
			"\t\t\t\t},",
			"\t\t\t},",
		].join("\n"),
	);
	const onModule = await import(`${onPath}?v=pulled`);
	const onWire = onModule.default as {
		features: Record<string, unknown>[];
	};
	expect(onWire.features[0]).toEqual({
		name: "API Calls",
		type: "metered",
		consumable: true,
		feature_id: "api_calls",
		processors: {
			stripe: { product_id: "prod_123", meter_id: "meter_456" },
		},
	});
});

test("an archived server row with a delete-action is not appended", async () => {
	const dir = tempDir({ name: "archived" });
	const path = writeConfig({
		dir,
		text: [
			'import { atmn } from "../../../src/generated/wire";',
			'import { feature } from "../../../src/generated/features";',
			"",
			"export default atmn({",
			"\tfeatures: [],",
			"});",
			"",
		].join("\n"),
	});
	const before = readFileSync(path, "utf8");
	let output = "";
	const result = await runPull({
		client: fakeClient({
			preview: { features: [{ featureId: "messages", action: "delete" }] },
			catalog: {
				features: [{ ...messagesRow, archived: true }],
				plans: [],
			},
		}),
		cwd: dir,
		write: (text) => {
			output += text;
		},
	});

	expect(result.appended).toEqual([]);
	expect(output).toBe("Nothing to pull.\n");
	expect(readFileSync(path, "utf8")).toBe(before);
});

test("a fixture that is not a plain literal stops the pull before any write", async () => {
	const { runPull, UnlocatableFixturesError } = await import(
		"../src/actions/pull"
	);
	const dir = `${import.meta.dir}/.tmp/pull-unlocatable`;
	const { mkdirSync, readFileSync, writeFileSync } = await import("node:fs");
	mkdirSync(dir, { recursive: true });
	const configPath = `${dir}/autumn.config.ts`;
	const before = [
		'import { feature } from "../../../src/generated/features";',
		'import { atmn } from "../../../src/generated/wire";',
		"",
		'const ids = ["seats"];',
		"export default atmn({",
		"\tfeatures: ids.map((id) =>",
		'\t\tfeature({ featureId: id, name: "Seats", type: "boolean" }),',
		"\t),",
		"});",
		"",
	].join("\n");
	writeFileSync(configPath, before, "utf8");

	const client = {
		previewUpdate: async () => ({
			features: [{ featureId: "seats", action: "update" }],
			plans: [],
		}),
		update: async () => ({}),
		get: async () => ({
			features: [
				{
					id: "seats",
					name: "Seats (server)",
					type: "boolean",
					consumable: false,
					archived: false,
				},
			],
			plans: [],
		}),
	};

	await expect(
		// biome-ignore lint/suspicious/noExplicitAny: a fake client
		runPull({ client: client as any, cwd: dir, write: () => {} }),
	).rejects.toBeInstanceOf(UnlocatableFixturesError);
	await expect(
		// biome-ignore lint/suspicious/noExplicitAny: a fake client
		runPull({ client: client as any, cwd: dir, write: () => {} }),
	).rejects.toThrow(/features "seats": replace with the server's copy/);
	expect(readFileSync(configPath, "utf8")).toBe(before);
});

test("a first pull scaffolds the config and fills it from the server", async () => {
	const { runPull } = await import("../src/actions/pull");
	const { existsSync, rmSync } = await import("node:fs");
	const dir = `${import.meta.dir}/.tmp/pull-first`;
	rmSync(dir, { recursive: true, force: true });
	const { mkdirSync } = await import("node:fs");
	mkdirSync(dir, { recursive: true });

	const client = {
		previewUpdate: async () => ({
			features: [
				{ featureId: "seats", action: "delete" },
				{ featureId: "messages", action: "delete" },
			],
			plans: [],
		}),
		update: async () => ({}),
		get: async () => ({
			features: [
				{
					id: "seats",
					name: "Seats",
					type: "boolean",
					consumable: false,
					archived: false,
				},
				{
					id: "messages",
					name: "Messages",
					type: "metered",
					consumable: true,
					archived: false,
				},
			],
			plans: [],
		}),
	};
	const printed: string[] = [];
	const result = await runPull({
		// biome-ignore lint/suspicious/noExplicitAny: a fake client
		client: client as any,
		cwd: dir,
		write: (text) => printed.push(text),
		imports: {
			atmn: "../../../src/generated/wire",
			builders: "../../../src/generated/features",
		},
	});

	expect(result.appended.sort()).toEqual(["messages", "seats"]);
	expect(printed[0]).toStartWith("Scaffolded ");
	expect(existsSync(`${dir}/planVersions/.gitkeep`)).toBe(true);

	const module = await import(`${dir}/autumn.config.ts?v=first`);
	// biome-ignore lint/suspicious/noExplicitAny: the executed wire
	const wire = module.default as any;
	expect(
		wire.features.map((row: { feature_id: string }) => row.feature_id).sort(),
	).toEqual(["messages", "seats"]);
});
