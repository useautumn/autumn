#!/usr/bin/env bun

import { resolve } from "node:path";

const TESTS_DIR = resolve(import.meta.dirname, "../../server/tests");

const SOURCES = {
	items: "utils/fixtures/items.ts",
	products: "utils/fixtures/products.ts",
	scenario: "utils/testInitUtils/initScenario.ts",
} as const;

const read = ({ path }: { path: string }) =>
	Bun.file(resolve(TESTS_DIR, path)).text();

const oneLine = ({ text }: { text: string }): string =>
	text
		.split("\n")
		.map((line) => line.replace(/\/\/.*$/, "").trim())
		.filter(Boolean)
		.join(" ")
		.replace(/,\s*$/, "");

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
	path: string;
	target: string;
};

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
