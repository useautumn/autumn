#!/usr/bin/env bun

/**
 * Prints test-fixture and scenario-action signatures, read live from source.
 *
 * Only covers the two catalogs whose definitions are scattered across large
 * files (items.ts ~900 lines, initScenario.ts ~1900) and so can't be recovered
 * with one grep. Everything else has a one-command lookup — see the `tdd` skill.
 *
 *   bun scripts/testScripts/surface.ts [fixtures|actions]
 */

import { resolve } from "node:path";

const TESTS_DIR = resolve(import.meta.dirname, "../../server/tests");

const SOURCES = {
	items: "utils/fixtures/items.ts",
	products: "utils/fixtures/products.ts",
	scenario: "utils/testInitUtils/initScenario.ts",
} as const;

const read = ({ path }: { path: string }) =>
	Bun.file(resolve(TESTS_DIR, path)).text();

// ── parsing ─────────────────────────────────────────────────────────────────

/** Collapse a multi-line source slice into one comment-free line. */
const oneLine = ({ text }: { text: string }): string =>
	text
		.split("\n")
		.map((line) => line.replace(/\/\/.*$/, "").trim())
		.filter(Boolean)
		.join(" ")
		.replace(/,\s*$/, "");

/** Index of the delimiter closing the one opened at `from`. */
const matchDelimiter = ({
	source,
	from,
	open,
	close,
}: {
	source: string;
	from: number;
	open: string;
	close: string;
}): number => {
	let depth = 0;
	for (let i = from; i < source.length; i++) {
		if (source[i] === open) depth++;
		if (source[i] === close) {
			depth--;
			if (depth === 0) return i;
		}
	}
	return -1;
};

/**
 * Parameter list of `const <name> = (…)`, following `const a = b` aliases and
 * tolerating curried definitions. Destructured params print their keys and
 * defaults; positional params print verbatim.
 */
const readParams = ({
	source,
	name,
	seen = new Set<string>(),
}: {
	source: string;
	name: string;
	seen?: Set<string>;
}): string => {
	if (seen.has(name)) return "(?)";
	seen.add(name);

	const declaration = new RegExp(`\\bconst ${name} =\\s*`).exec(source);
	if (!declaration) return "(?)";
	const after = declaration.index + declaration[0].length;

	// `const multiAttach = billingMultiAttach;` — resolve through the alias.
	const alias = /^(\w+);/.exec(source.slice(after));
	if (alias) return readParams({ source, name: alias[1] as string, seen });

	const paren = source.indexOf("(", after);
	if (paren === -1) return "()";
	const parenEnd = matchDelimiter({
		source,
		from: paren,
		open: "(",
		close: ")",
	});
	if (parenEnd === -1) return "()";

	const inner = source.slice(paren + 1, parenEnd);
	if (!inner.trimStart().startsWith("{")) {
		return `(${oneLine({ text: inner })})`;
	}

	const braceStart = paren + 1 + inner.indexOf("{");
	const braceEnd = matchDelimiter({
		source,
		from: braceStart,
		open: "{",
		close: "}",
	});
	if (braceEnd === -1) return "()";
	return `({ ${oneLine({ text: source.slice(braceStart + 1, braceEnd) })} })`;
};

type Entry = {
	/** Dotted path as written at the call site, e.g. `billing.attach`. */
	path: string;
	/** Identifier the key points at, e.g. `billingAttach`. */
	target: string;
};

/** Flatten an `export const <name> = { … }` literal into dotted paths. */
const readExportedObject = ({
	source,
	name,
}: {
	source: string;
	name: string;
}): Entry[] => {
	const start = source.indexOf(`export const ${name} = {`);
	if (start === -1) return [];

	const open = source.indexOf("{", start);
	const entries: Entry[] = [];
	const stack: string[] = [];
	let depth = 0;
	let token = "";

	const push = () => {
		const [rawKey, rawValue] = token.split(":");
		const key = rawKey?.trim();
		if (!key || /\W/.test(key)) return;
		entries.push({
			path: [...stack, key].join("."),
			target: rawValue?.trim() || key,
		});
	};

	for (let i = open; i < source.length; i++) {
		const char = source[i];

		if (char === "{") {
			depth++;
			// A key preceding a nested literal is a namespace, not an entry.
			if (depth > 1) stack.push(token.split(":")[0]?.trim() ?? "");
			token = "";
			continue;
		}
		if (char === "}") {
			push();
			depth--;
			if (depth === 0) break;
			stack.pop();
			token = "";
			continue;
		}
		if (char === ",") {
			push();
			token = "";
			continue;
		}
		token += char;
	}

	return entries;
};

// ── sections ────────────────────────────────────────────────────────────────

const printCatalog = async ({
	file,
	object,
	prefix,
}: {
	file: string;
	object: string;
	prefix: string;
}) => {
	const source = await read({ path: file });
	const entries = readExportedObject({ source, name: object });

	console.log(`\n## ${prefix}.* — server/tests/${file} (${entries.length})`);
	for (const { path, target } of entries) {
		console.log(`  ${prefix}.${path}${readParams({ source, name: target })}`);
	}
};

const printFixtures = async () => {
	await printCatalog({ file: SOURCES.items, object: "items", prefix: "items" });
	await printCatalog({
		file: SOURCES.products,
		object: "products",
		prefix: "products",
	});
};

const printActions = () =>
	printCatalog({ file: SOURCES.scenario, object: "s", prefix: "s" });

// ── main ────────────────────────────────────────────────────────────────────

const SECTIONS = { fixtures: printFixtures, actions: printActions } as const;
type Section = keyof typeof SECTIONS;

const requested = process.argv.slice(2).filter((arg) => !arg.startsWith("-"));
const unknown = requested.filter((arg) => !(arg in SECTIONS));

if (unknown.length > 0) {
	console.error(
		`unknown section(s): ${unknown.join(", ")}\nvalid: ${Object.keys(SECTIONS).join(", ")}`,
	);
	process.exit(1);
}

for (const section of (requested.length > 0
	? requested
	: Object.keys(SECTIONS)) as Section[]) {
	await SECTIONS[section]();
}
console.log("");
