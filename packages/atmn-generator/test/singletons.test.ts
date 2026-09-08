import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SINGLETONS } from "../src/collections";
import { renamedPaths } from "../src/emit/freeFormPaths";
import { OVERLAY } from "../src/overlay/overlay";
import { loadSpec, requestBodySchema } from "../src/spec/loadSpec";

const generated = join(import.meta.dir, "../../atmn-nightly/src/generated");

test("every singleton has a generated type, no builder", () => {
	for (const [name, meta] of Object.entries(SINGLETONS)) {
		const source = readFileSync(join(generated, `${name}.ts`), "utf8");
		expect(source).toContain(`export type ${meta.typeName} = {`);
		expect(source).not.toContain("=> input;");
	}
});

test("the settings type carries every flag the operation accepts, renamed and defaulted", () => {
	const spec = loadSpec();
	const body = requestBodySchema({
		spec,
		path: SINGLETONS.settings.operationPath,
	});
	const wireKeys = Object.keys(body.properties?.config?.properties ?? {});
	expect(wireKeys.length).toBeGreaterThan(0);

	const source = readFileSync(join(generated, "settings.ts"), "utf8");
	for (const wireKey of wireKeys) {
		const rename = OVERLAY.collections.settings?.[wireKey]?.rename;
		const name =
			rename ?? wireKey.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
		expect(source).toContain(`${name}?: boolean;`);
	}
	// The default is documented so a reader knows what omission means.
	expect(source).toContain("Defaults to false.");
	expect(source).toContain("paydownOverages?: boolean;");
	expect(source).not.toContain("persistFreeOverage");
});

test("emit.ts ships the field table pull edits from: fixture key, wire key, default", async () => {
	const { SINGLETONS: emitted } = await import(join(generated, "emit.ts"));
	expect(emitted.settings.wireKey).toBe("config");
	expect(emitted.settings.fields).toContainEqual({
		key: "paydownOverages",
		wireKey: "persist_free_overage",
		default: false,
	});
	expect(emitted.settings.fields.map((f: { key: string }) => f.key)).toContain(
		"multiCurrency",
	);
});

test("an overlay rename becomes a wire hint rooted at the config key", () => {
	expect(
		renamedPaths({ overlay: OVERLAY, roots: { settings: "settings" } }),
	).toEqual({ "settings.paydownOverages": "persist_free_overage" });
});

test("responses are recased, never renamed: the type and the runtime agree", async () => {
	const source = readFileSync(join(generated, "client.ts"), "utf8");
	expect(source).toContain("persistFreeOverage: boolean;");
	expect(source).not.toContain('"config.paydownOverages"');
});
