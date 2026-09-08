import { expect, test } from "bun:test";
import { appendToCollection } from "../../src/surgery/appendToCollection";

const configSource = `import { atmn, feature } from "atmn";

// a comment that must survive
export default atmn({
	features: [
		seats,
		feature({
			featureId: "messages",
			name: "Messages",
			type: "metered",
			consumable: true,
		}),
	],
	plans: [],
});
`;

const creditsText = `feature({
			featureId: "credits",
			name: "Credits",
			type: "credit_system",
		})`;

test("appends after the last element with a trailing comma and sibling indent", () => {
	const output = appendToCollection({
		source: configSource,
		collection: "features",
		text: creditsText,
	});
	expect(output).toBe(`import { atmn, feature } from "atmn";

// a comment that must survive
export default atmn({
	features: [
		seats,
		feature({
			featureId: "messages",
			name: "Messages",
			type: "metered",
			consumable: true,
		}),
		feature({
			featureId: "credits",
			name: "Credits",
			type: "credit_system",
		}),
	],
	plans: [],
});
`);
});

test("everything before the insertion point is byte-identical", () => {
	const insertBefore = configSource.indexOf("\t],");
	const output = appendToCollection({
		source: configSource,
		collection: "features",
		text: creditsText,
	});
	expect(output?.startsWith(configSource.slice(0, insertBefore))).toBe(true);
});

test("a $ inside the appended text survives verbatim", () => {
	const output = appendToCollection({
		source: configSource,
		collection: "features",
		text: 'note: "costs 5$"',
	});
	expect(output).toContain('note: "costs 5$",\n\t],');
});

// Pull builds multi-line fixtures against the indent the surgery will give
// their first line, so the closing paren lines up with the sibling.
test("a function text is built against the indent of its first line", () => {
	const output = appendToCollection({
		source: configSource,
		collection: "features",
		text: (elementIndent) =>
			`feature({\n${elementIndent}\tfeatureId: "credits",\n${elementIndent}\tname: "Credits",\n${elementIndent}\ttype: "credit_system",\n${elementIndent}})`,
	});
	expect(output).toBe(`import { atmn, feature } from "atmn";

// a comment that must survive
export default atmn({
	features: [
		seats,
		feature({
			featureId: "messages",
			name: "Messages",
			type: "metered",
			consumable: true,
		}),
		feature({
			featureId: "credits",
			name: "Credits",
			type: "credit_system",
		}),
	],
	plans: [],
});
`);
});

test("a last element without a trailing comma gets one", () => {
	const source = `export default atmn({
	features: [
		seats
	],
});
`;
	expect(
		appendToCollection({ source, collection: "features", text: "messages" }),
	).toBe(
		"export default atmn({\n\tfeatures: [\n\t\tseats,\n\t\tmessages,\n\t],\n});\n",
	);
});

test("an empty array is seeded as a one-element list", () => {
	const source = "export default atmn({\n\tfeatures: [],\n});\n";
	expect(
		appendToCollection({ source, collection: "features", text: "seats" }),
	).toBe("export default atmn({\n\tfeatures: [\n\t\tseats,\n\t],\n});\n");
});

test("another collection with the same shape is left alone", () => {
	const output = appendToCollection({
		source: configSource,
		collection: "plans",
		text: "starter",
	});
	expect(output).toContain("\tplans: [\n\t\tstarter,\n\t],");
	expect(output).toContain('featureId: "messages"');
	expect(output?.indexOf("starter")).toBeGreaterThan(
		output?.indexOf("messages") ?? 0,
	);
});

test("no atmn collection returns null", () => {
	const source = "export default other({ features: [] });\n";
	expect(
		appendToCollection({ source, collection: "features", text: "seats" }),
	).toBeNull();
});
