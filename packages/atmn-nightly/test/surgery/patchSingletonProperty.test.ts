/**
 * The settings block is edited where it stands, key by key: seeded when the
 * config has none, a pair appended when the key is new, its literal replaced
 * when wrong, and the pair removed when the server's value is the default.
 */

import { expect, test } from "bun:test";
import {
	patchSingletonProperty,
	singletonPropertyText,
} from "../../src/surgery/patchSingletonProperty";

const config = ({ body }: { body: string }): string =>
	`import { atmn } from "atmn-nightly";

export default atmn({
${body}
});
`;

test("no settings key: the block is seeded beside the collections", () => {
	const source = config({ body: "\tfeatures: [],\n\tplans: []," });
	const updated = patchSingletonProperty({
		source,
		singleton: "settings",
		edit: { key: "multiCurrency", text: "true" },
	});
	expect(updated).toBe(
		config({
			body: "\tfeatures: [],\n\tplans: [],\n\tsettings: { multiCurrency: true },",
		}),
	);
});

test("settings stated, key absent: the pair is appended", () => {
	const source = config({
		body: "\tfeatures: [],\n\tsettings: {\n\t\tcancelOnPastDue: true,\n\t},",
	});
	const updated = patchSingletonProperty({
		source,
		singleton: "settings",
		edit: { key: "multiCurrency", text: "true" },
	});
	expect(updated).toBe(
		config({
			body: "\tfeatures: [],\n\tsettings: {\n\t\tcancelOnPastDue: true,\n\t\tmultiCurrency: true,\n\t},",
		}),
	);
});

test("key stated wrongly: only its literal moves", () => {
	const source = config({
		body: "\tfeatures: [],\n\tsettings: { cancelOnPastDue: false, multiCurrency: true },",
	});
	const updated = patchSingletonProperty({
		source,
		singleton: "settings",
		edit: { key: "cancelOnPastDue", text: "true" },
	});
	expect(updated).toBe(
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
			singleton: "settings",
			edit: { key: "cancelOnPastDue", text: null },
		}),
	).toBe(
		config({
			body: "\tfeatures: [],\n\tsettings: {\n\t\tmultiCurrency: true,\n\t},",
		}),
	);

	const inline = config({
		body: "\tfeatures: [],\n\tsettings: { cancelOnPastDue: true, multiCurrency: true },",
	});
	expect(
		patchSingletonProperty({
			source: inline,
			singleton: "settings",
			edit: { key: "cancelOnPastDue", text: null },
		}),
	).toBe(
		config({ body: "\tfeatures: [],\n\tsettings: { multiCurrency: true }," }),
	);
});

test("a removal with no settings block seeds nothing", () => {
	const source = config({ body: "\tfeatures: []," });
	expect(
		patchSingletonProperty({
			source,
			singleton: "settings",
			edit: { key: "cancelOnPastDue", text: null },
		}),
	).toBe(source);
});

test("a settings value that is not an object literal is refused", () => {
	const source = config({ body: "\tfeatures: [],\n\tsettings: shared," });
	expect(
		patchSingletonProperty({
			source,
			singleton: "settings",
			edit: { key: "multiCurrency", text: "true" },
		}),
	).toBeNull();
});

test("singletonPropertyText reads the literal a key holds", () => {
	const source = config({
		body: "\tfeatures: [],\n\tsettings: { multiCurrency: true },",
	});
	expect(
		singletonPropertyText({
			source,
			singleton: "settings",
			key: "multiCurrency",
		}),
	).toBe("true");
	expect(
		singletonPropertyText({
			source,
			singleton: "settings",
			key: "cancelOnPastDue",
		}),
	).toBeNull();
});
