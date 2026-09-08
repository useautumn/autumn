/**
 * The settings lane through push and pull against a fake client. Push sends
 * the block to its own operation and applies it only when the preview shows a
 * stated flag moving; pull writes the server's non-default flags into the
 * block and removes any back at their default.
 */

import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runPull } from "../src/actions/pull";
import { runPush } from "../src/actions/push";

const tempDir = ({ name }: { name: string }): string => {
	const dir = join(import.meta.dir, ".tmp", `settings-${name}`);
	rmSync(dir, { recursive: true, force: true });
	mkdirSync(dir, { recursive: true });
	return dir;
};

const configWith = ({ body }: { body: string }): string =>
	[
		'import { atmn } from "../../../src/generated/wire";',
		"",
		"export default atmn({",
		body,
		"});",
		"",
	].join("\n");

type Call = { method: string; body: unknown };

/** Every operation records its call; the settings preview answers as told. */
const fakeClient = ({
	settingsChanges,
	catalogPreview = { features: [], plans: [] },
}: {
	settingsChanges: unknown[];
	catalogPreview?: unknown;
}) => {
	const calls: Call[] = [];
	const record =
		(method: string, response: unknown) =>
		async (body: unknown): Promise<unknown> => {
			calls.push({ method, body });
			return response;
		};
	return {
		calls,
		client: {
			previewUpdate: record("previewUpdate", catalogPreview),
			update: record("update", { results: {}, migrations: [] }),
			get: record("get", { features: [], plans: [] }),
			previewUpdateOrganization: record("previewUpdateOrganization", {
				config: { changes: settingsChanges },
			}),
			updateOrganization: record("updateOrganization", { config: {} }),
		},
	};
};

test("push sends only the settings body to organization.update, and only when a flag moves", async () => {
	const dir = tempDir({ name: "push" });
	writeFileSync(
		join(dir, "autumn.config.ts"),
		configWith({
			body: "\tfeatures: [],\n\tsettings: { multiCurrency: true, paydownOverages: true },",
		}),
	);
	const { calls, client } = fakeClient({
		settingsChanges: [
			{
				key: "multi_currency",
				action: "update",
				previous: false,
				current: true,
			},
		],
	});
	let output = "";
	// biome-ignore lint/suspicious/noExplicitAny: a fake client
	await runPush({
		client: client as any,
		cwd: dir,
		write: (t) => (output += t),
	});

	// Settings are previewed and applied BEFORE the catalog is previewed: a flag
	// like multi_currency changes what the catalog accepts.
	const settingsCalls = calls.filter((call) => call.method !== "get");
	expect(settingsCalls.map((call) => call.method)).toEqual([
		"previewUpdateOrganization",
		"updateOrganization",
		"previewUpdate",
	]);
	// The catalog body never carries settings; the settings body carries only the stated, renamed flags.
	expect("settings" in (settingsCalls[2].body as object)).toBe(false);
	expect(settingsCalls[1].body).toEqual({
		config: { multi_currency: true, persist_free_overage: true },
	});
	expect(output).toContain("~ Multi-currency: false -> true");
	expect(output).toContain("Applied settings.");
});

test("push with no settings block never calls the organization operations", async () => {
	const dir = tempDir({ name: "push-absent" });
	writeFileSync(
		join(dir, "autumn.config.ts"),
		configWith({ body: "\tfeatures: []," }),
	);
	const { calls, client } = fakeClient({ settingsChanges: [] });
	// biome-ignore lint/suspicious/noExplicitAny: a fake client
	await runPush({ client: client as any, cwd: dir, write: () => {} });
	expect(calls.some((call) => call.method.endsWith("Organization"))).toBe(
		false,
	);
});

test("push with only unmanaged flags applies nothing but says so", async () => {
	const dir = tempDir({ name: "push-unmanaged" });
	writeFileSync(
		join(dir, "autumn.config.ts"),
		configWith({
			body: "\tfeatures: [],\n\tsettings: { multiCurrency: true },",
		}),
	);
	const { calls, client } = fakeClient({
		settingsChanges: [
			{
				key: "invoice_memos",
				action: "unmanaged",
				previous: true,
				current: null,
			},
		],
	});
	let output = "";
	// biome-ignore lint/suspicious/noExplicitAny: a fake client
	await runPush({
		client: client as any,
		cwd: dir,
		write: (t) => (output += t),
	});
	expect(calls.some((call) => call.method === "updateOrganization")).toBe(
		false,
	);
	expect(output).toContain("Invoice memos: true -> unmanaged");
});

test("pull writes non-default flags into settings and drops one back at its default", async () => {
	const dir = tempDir({ name: "pull" });
	const path = join(dir, "autumn.config.ts");
	writeFileSync(
		path,
		configWith({
			body: "\tfeatures: [],\n\tsettings: { cancelOnPastDue: true },",
		}),
	);
	const { client } = fakeClient({
		settingsChanges: [
			// The config says true; the server holds the default.
			{
				key: "cancel_on_past_due",
				action: "update",
				previous: false,
				current: true,
			},
			// The config says nothing; the server holds a non-default, under its renamed key.
			{
				key: "persist_free_overage",
				action: "unmanaged",
				previous: true,
				current: null,
			},
		],
	});
	let output = "";
	// biome-ignore lint/suspicious/noExplicitAny: a fake client
	await runPull({
		client: client as any,
		cwd: dir,
		write: (t) => (output += t),
	});

	expect(readFileSync(path, "utf8")).toBe(
		configWith({
			body: "\tfeatures: [],\n\tsettings: { paydownOverages: true },",
		}),
	);
	expect(output).toBe(
		"~ settings.cancelOnPastDue\n~ settings.paydownOverages\nPulled.\n",
	);
});

test("pull seeds a settings block when the server holds a non-default the config never stated", async () => {
	const dir = tempDir({ name: "pull-seed" });
	const path = join(dir, "autumn.config.ts");
	writeFileSync(path, configWith({ body: "\tfeatures: []," }));
	const { calls, client } = fakeClient({
		settingsChanges: [
			{
				key: "multi_currency",
				action: "unmanaged",
				previous: true,
				current: null,
			},
		],
	});
	// biome-ignore lint/suspicious/noExplicitAny: a fake client
	await runPull({ client: client as any, cwd: dir, write: () => {} });

	// Asked with an empty body: the config stated no settings.
	expect(
		calls.find((call) => call.method === "previewUpdateOrganization")?.body,
	).toEqual({ config: {} });
	expect(readFileSync(path, "utf8")).toBe(
		configWith({
			body: "\tfeatures: [],\n\tsettings: { multiCurrency: true },",
		}),
	);
});

test("pull drops a stated flag the server also holds at its default, though the preview is silent", async () => {
	const dir = tempDir({ name: "pull-default" });
	const path = join(dir, "autumn.config.ts");
	writeFileSync(
		path,
		configWith({
			body: "\tfeatures: [],\n\tsettings: { multiCurrency: true, cancelOnPastDue: false },",
		}),
	);
	// Both stated flags match the server, so the preview names neither.
	const { client } = fakeClient({ settingsChanges: [] });
	let output = "";
	// biome-ignore lint/suspicious/noExplicitAny: a fake client
	await runPull({
		client: client as any,
		cwd: dir,
		write: (t) => (output += t),
	});

	expect(readFileSync(path, "utf8")).toBe(
		configWith({
			body: "\tfeatures: [],\n\tsettings: { multiCurrency: true },",
		}),
	);
	expect(output).toBe("~ settings.cancelOnPastDue\nPulled.\n");
});

test("catalog work with settings in sync applies the catalog only", async () => {
	const dir = tempDir({ name: "push-catalog-only" });
	writeFileSync(
		join(dir, "autumn.config.ts"),
		configWith({
			body: "\tfeatures: [],\n\tsettings: { multiCurrency: true },",
		}),
	);
	const { calls, client } = fakeClient({
		settingsChanges: [],
		catalogPreview: {
			features: [{ featureId: "gone", action: "delete" }],
			plans: [],
		},
	});
	// biome-ignore lint/suspicious/noExplicitAny: a fake client
	await runPush({ client: client as any, cwd: dir, write: () => {} });
	expect(calls.map((call) => call.method)).toEqual([
		"previewUpdateOrganization",
		"previewUpdate",
		"update",
	]);
});

test("a dry run previews settings and catalog without writing either", async () => {
	const dir = tempDir({ name: "push-dry" });
	writeFileSync(
		join(dir, "autumn.config.ts"),
		configWith({
			body: "\tfeatures: [],\n\tsettings: { multiCurrency: true },",
		}),
	);
	const { calls, client } = fakeClient({
		settingsChanges: [
			{
				key: "multi_currency",
				action: "update",
				previous: false,
				current: true,
			},
		],
		catalogPreview: {
			features: [{ featureId: "gone", action: "delete" }],
			plans: [],
		},
	});
	let output = "";
	await runPush({
		// biome-ignore lint/suspicious/noExplicitAny: a fake client
		client: client as any,
		cwd: dir,
		dryRun: true,
		write: (t) => (output += t),
	});
	expect(calls.map((call) => call.method)).toEqual([
		"previewUpdateOrganization",
		"previewUpdate",
	]);
	expect(output).toContain("~ Multi-currency: false -> true");
	expect(output).toContain("- gone");
	expect(output).not.toContain("Applied");
});

test("pull edits a settings block the config names as a const, local or imported", async () => {
	const dir = tempDir({ name: "pull-binding" });
	const path = join(dir, "autumn.config.ts");
	writeFileSync(
		join(dir, "settings.ts"),
		"export const settings = {\n\tcancelOnPastDue: true,\n};\n",
	);
	writeFileSync(
		path,
		[
			'import { atmn } from "../../../src/generated/wire";',
			'import { settings } from "./settings";',
			"",
			"export default atmn({",
			"\tfeatures: [],",
			"\tsettings,",
			"});",
			"",
		].join("\n"),
	);
	const { client } = fakeClient({
		settingsChanges: [
			{
				key: "multi_currency",
				action: "unmanaged",
				previous: true,
				current: null,
			},
		],
	});
	let output = "";
	// biome-ignore lint/suspicious/noExplicitAny: a fake client
	await runPull({
		client: client as any,
		cwd: dir,
		write: (t) => (output += t),
	});

	expect(readFileSync(join(dir, "settings.ts"), "utf8")).toBe(
		"export const settings = {\n\tcancelOnPastDue: true,\n\tmultiCurrency: true,\n};\n",
	);
	expect(output).toBe("~ settings.multiCurrency\nPulled.\n");
});

test("pull refuses a settings value it cannot edit, naming the key", async () => {
	const dir = tempDir({ name: "pull-dynamic" });
	writeFileSync(
		join(dir, "autumn.config.ts"),
		[
			'import { atmn } from "../../../src/generated/wire";',
			"",
			"const shared = () => ({ multiCurrency: false });",
			"",
			"export default atmn({",
			"\tfeatures: [],",
			"\tsettings: shared(),",
			"});",
			"",
		].join("\n"),
	);
	const { client } = fakeClient({
		settingsChanges: [
			{
				key: "multi_currency",
				action: "unmanaged",
				previous: true,
				current: null,
			},
		],
	});
	await expect(
		// biome-ignore lint/suspicious/noExplicitAny: a fake client
		runPull({ client: client as any, cwd: dir, write: () => {} }),
	).rejects.toThrow(/settings "multiCurrency"/);
});
