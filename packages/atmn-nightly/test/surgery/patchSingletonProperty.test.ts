/**
 * The settings block is edited where it stands, key by key: a pair appended
 * when the key is new, its literal replaced when wrong, the pair removed when
 * the server's value is the default. The block may be inline under the key or
 * a const the key names — the same shapes a collection's array may take.
 */

import { expect, test } from "bun:test";
import {
	insertSingleton,
	patchSingletonProperty,
	singletonPropertyText,
} from "../../src/surgery/patchSingletonProperty";

const config = ({ body }: { body: string }): string =>
	`import { atmn } from "atmn-nightly";

export default atmn({
${body}
});
`;

const inline = { kind: "inline", singleton: "settings" } as const;

test("no settings key: insertSingleton seeds an empty block beside the collections", () => {
	const source = config({ body: "\tfeatures: [],\n\tplans: []," });
	expect(insertSingleton({ source, singleton: "settings" })).toBe(
		config({ body: "\tfeatures: [],\n\tplans: [],\n\tsettings: {}," }),
	);
	// Already there: untouched.
	const stated = config({ body: "\tfeatures: [],\n\tsettings: { a: true }," });
	expect(insertSingleton({ source: stated, singleton: "settings" })).toBe(
		stated,
	);
});

test("an empty block takes its first pair inline", () => {
	const source = config({ body: "\tfeatures: [],\n\tsettings: {}," });
	expect(
		patchSingletonProperty({
			source,
			block: inline,
			edit: { key: "multiCurrency", text: "true" },
		}),
	).toBe(
		config({ body: "\tfeatures: [],\n\tsettings: { multiCurrency: true }," }),
	);
});

test("settings stated, key absent: the pair is appended", () => {
	const source = config({
		body: "\tfeatures: [],\n\tsettings: {\n\t\tcancelOnPastDue: true,\n\t},",
	});
	expect(
		patchSingletonProperty({
			source,
			block: inline,
			edit: { key: "multiCurrency", text: "true" },
		}),
	).toBe(
		config({
			body: "\tfeatures: [],\n\tsettings: {\n\t\tcancelOnPastDue: true,\n\t\tmultiCurrency: true,\n\t},",
		}),
	);
});

test("key stated wrongly: only its literal moves", () => {
	const source = config({
		body: "\tfeatures: [],\n\tsettings: { cancelOnPastDue: false, multiCurrency: true },",
	});
	expect(
		patchSingletonProperty({
			source,
			block: inline,
			edit: { key: "cancelOnPastDue", text: "true" },
		}),
	).toBe(
		config({
			body: "\tfeatures: [],\n\tsettings: { cancelOnPastDue: true, multiCurrency: true },",
		}),
	);
});

test("a value back at its default removes the pair, on its own line or inline", () => {
	const multiline = config({
		body: "\tfeatures: [],\n\tsettings: {\n\t\tcancelOnPastDue: true,\n\t\tmultiCurrency: true,\n\t},",
	});
	expect(
		patchSingletonProperty({
			source: multiline,
			block: inline,
			edit: { key: "cancelOnPastDue", text: null },
		}),
	).toBe(
		config({
			body: "\tfeatures: [],\n\tsettings: {\n\t\tmultiCurrency: true,\n\t},",
		}),
	);

	const oneLine = config({
		body: "\tfeatures: [],\n\tsettings: { cancelOnPastDue: true, multiCurrency: true },",
	});
	expect(
		patchSingletonProperty({
			source: oneLine,
			block: inline,
			edit: { key: "cancelOnPastDue", text: null },
		}),
	).toBe(
		config({ body: "\tfeatures: [],\n\tsettings: { multiCurrency: true }," }),
	);

	// The last pair out collapses to `{}`.
	const last = config({
		body: "\tfeatures: [],\n\tsettings: { cancelOnPastDue: true },",
	});
	expect(
		patchSingletonProperty({
			source: last,
			block: inline,
			edit: { key: "cancelOnPastDue", text: null },
		}),
	).toBe(config({ body: "\tfeatures: [],\n\tsettings: {}," }));
});

test("a const the key names is edited through its binding", () => {
	const source = `import { atmn } from "atmn-nightly";

const settings = {
	cancelOnPastDue: true,
};

export default atmn({
	features: [],
	settings,
});
`;
	expect(
		patchSingletonProperty({
			source,
			block: { kind: "binding", name: "settings" },
			edit: { key: "multiCurrency", text: "true" },
		}),
	).toBe(`import { atmn } from "atmn-nightly";

const settings = {
	cancelOnPastDue: true,
	multiCurrency: true,
};

export default atmn({
	features: [],
	settings,
});
`);
});

test("a block holding a spread is refused: a later spread would win over any pair set", () => {
	const source = config({
		body: "\tfeatures: [],\n\tsettings: { cancelOnPastDue: true, ...shared },",
	});
	expect(
		patchSingletonProperty({
			source,
			block: inline,
			edit: { key: "cancelOnPastDue", text: "false" },
		}),
	).toBeNull();
	expect(
		patchSingletonProperty({
			source,
			block: inline,
			edit: { key: "cancelOnPastDue", text: null },
		}),
	).toBeNull();
});

test("a root spread refuses seeding: the spread may already hold the key", () => {
	const source = config({ body: "\t...shared," });
	expect(insertSingleton({ source, singleton: "settings" })).toBeNull();
});

test("a quoted settings key is found, not seeded twice", () => {
	const source = config({
		body: '\tfeatures: [],\n\t"settings": { a: true },',
	});
	expect(insertSingleton({ source, singleton: "settings" })).toBe(source);
});

test("a comment before the comma is trivia when the pair is removed", () => {
	const source = config({
		body: "\tfeatures: [],\n\tsettings: {\n\t\tcancelOnPastDue: true /* why */,\n\t\tmultiCurrency: true,\n\t},",
	});
	expect(
		patchSingletonProperty({
			source,
			block: inline,
			edit: { key: "cancelOnPastDue", text: null },
		}),
	).toBe(
		config({
			body: "\tfeatures: [],\n\tsettings: {\n\t\tmultiCurrency: true,\n\t},",
		}),
	);
});

test("a settings value that is not an object literal is refused", () => {
	const source = config({ body: "\tfeatures: [],\n\tsettings: shared()," });
	expect(
		patchSingletonProperty({
			source,
			block: inline,
			edit: { key: "multiCurrency", text: "true" },
		}),
	).toBeNull();
});

test("singletonPropertyText reads the literal a key holds", () => {
	const source = config({
		body: "\tfeatures: [],\n\tsettings: { multiCurrency: true },",
	});
	expect(
		singletonPropertyText({ source, block: inline, key: "multiCurrency" }),
	).toBe("true");
	expect(
		singletonPropertyText({ source, block: inline, key: "cancelOnPastDue" }),
	).toBeNull();
});
