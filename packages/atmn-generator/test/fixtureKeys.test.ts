import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { emitFixtureType, objectMembers } from "../src/emit/emitType";
import { fixtureKeys } from "../src/emit/fixtureKeys";
import { OVERLAY } from "../src/overlay/overlay";
import { collectionItemSchema, loadSpec } from "../src/spec/loadSpec";

const spec = loadSpec();
const schema = collectionItemSchema({ spec, collection: "features" });

/** emitType emits unformatted, so the repo Biome supplies the indentation the
 * member parser keys on. */
const formattedType = (type: string): string => {
	const dir = join(import.meta.dir, ".tmp");
	mkdirSync(dir, { recursive: true });
	const path = join(dir, "Feature.ts");
	writeFileSync(path, type, "utf8");
	const biome = join(import.meta.dir, "../../../node_modules/.bin/biome");
	Bun.spawnSync([biome, "check", "--write", "--no-errors-on-unmatched", path]);
	return readFileSync(path, "utf8");
};

test("fixture keys match the emitted fixture type, key for key", () => {
	const keys = fixtureKeys({
		schema,
		overlay: OVERLAY,
		collection: "features",
	});

	// The emitted type is the truth, so the keys are read back out of it: one
	// walk cannot drift from the other. Top-level members sit at one tab.
	const type = formattedType(
		emitFixtureType({
			name: "Feature",
			schema,
			collection: "features",
			overlay: OVERLAY,
		}),
	);
	const emittedKeys = [...type.matchAll(/^\t([A-Za-z_$][\w$]*)(\?)?:/gm)].map(
		(match) => match[1],
	);

	expect(keys).toEqual(emittedKeys);
});

test("overlay and spec-order rules hold for features", () => {
	const keys = fixtureKeys({
		schema,
		overlay: OVERLAY,
		collection: "features",
	});

	for (const expected of [
		"featureId",
		"name",
		"type",
		"consumable",
		"creditSchema",
		"modelMarkups",
		"processors",
		"archived",
	]) {
		expect(keys).toContain(expected);
	}
	// Deprecated, but existing catalogs carry it, so it stays a fixture key.
	expect(keys).toContain("eventNames");
	// Dead since internal_id: a changed featureId is the rename.
	expect(keys).not.toContain("newFeatureId");
	// Spec order across the allOf branches, not alphabetical.
	expect(keys.indexOf("name")).toBeLessThan(keys.indexOf("featureId"));
	expect(keys.indexOf("featureId")).toBeLessThan(keys.indexOf("processors"));
});

test("objectMembers skips hidden and internal fields", () => {
	const names = objectMembers({
		schema,
		path: "",
		context: { overlay: OVERLAY, collection: "features" },
	}).map((member) => member.name);

	expect(names).not.toContain("newFeatureId");
});
