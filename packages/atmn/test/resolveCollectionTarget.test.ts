/** Where pull appends: inline arrays, local and imported consts (aliased,
 * typed), and the const behind a trailing spread. TypeScript-only: relative
 * `.ts` and `index.ts` specifiers; anything else is null, never a guess. */

import { expect, test } from "bun:test";
import { resolveCollectionTarget } from "../src/actions/pull/resolveCollectionTarget";

const root = "/cfg/autumn.config.ts";
const filesFor = (config: string, others: Record<string, string> = {}) =>
	new Map([[root, config], ...Object.entries(others)]);

test("an inline array is the config itself", () => {
	expect(
		resolveCollectionTarget({
			configPath: root,
			files: filesFor("export default atmn({ plans: [] });"),
			collection: "plans",
		}),
	).toEqual({ kind: "inline", file: root });
});

test("an aliased import resolves to the exported name in the imported file", () => {
	const files = filesFor(
		'import { bananas as fruit } from "./bananas";\nexport default atmn({ features: fruit });',
		{ "/cfg/bananas.ts": "export const bananas = [];" },
	);
	expect(
		resolveCollectionTarget({
			configPath: root,
			files,
			collection: "features",
		}),
	).toEqual({ kind: "binding", file: "/cfg/bananas.ts", name: "bananas" });
});

test("a typed const still counts as an array binding", () => {
	const files = filesFor(
		'import { plans } from "./catalog";\nexport default atmn({ plans });',
		{ "/cfg/catalog.ts": "export const plans: Plan[] = [];" },
	);
	expect(
		resolveCollectionTarget({ configPath: root, files, collection: "plans" }),
	).toEqual({ kind: "binding", file: "/cfg/catalog.ts", name: "plans" });
});

test("a trailing spread routes to that binding, an index file included", () => {
	const files = filesFor(
		'import { poo } from "./poo";\nimport { pee } from "./pee";\nexport default atmn({ planVersions: [...poo, ...pee] });',
		{
			"/cfg/poo.ts": "export const poo = [];",
			"/cfg/pee/index.ts": "export const pee = [];",
		},
	);
	expect(
		resolveCollectionTarget({
			configPath: root,
			files,
			collection: "planVersions",
		}),
	).toEqual({ kind: "binding", file: "/cfg/pee/index.ts", name: "pee" });
});

test("a spread of a call stays inline: a literal after it is still valid code", () => {
	const files = filesFor("export default atmn({ plans: [...load()] });");
	expect(
		resolveCollectionTarget({ configPath: root, files, collection: "plans" }),
	).toEqual({ kind: "inline", file: root });
});

test("a .js specifier or a barrel is null", () => {
	const js = filesFor(
		'import { a } from "./a.js";\nexport default atmn({ plans: a });',
		{ "/cfg/a.ts": "export const a = [];" },
	);
	expect(
		resolveCollectionTarget({
			configPath: root,
			files: js,
			collection: "plans",
		}),
	).toBeNull();
	const barrel = filesFor(
		'import { a } from "./index";\nexport default atmn({ plans: a });',
		{
			"/cfg/index.ts": 'export * from "./a";',
			"/cfg/a.ts": "export const a = [];",
		},
	);
	expect(
		resolveCollectionTarget({
			configPath: root,
			files: barrel,
			collection: "plans",
		}),
	).toBeNull();
});
