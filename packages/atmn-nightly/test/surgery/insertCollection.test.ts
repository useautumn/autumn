import { expect, test } from "bun:test";
import { appendToCollection } from "../../src/surgery/appendToCollection";
import { insertCollection } from "../../src/surgery/insertCollection";

const configSource = `import { atmn, feature } from "atmn";

// a comment that must survive
export default atmn({
	features: [
		feature({
			featureId: "messages",
			name: "Messages",
			type: "metered",
			consumable: true,
		}),
	],
});
`;

test("inserts the collection as the last property, after existing keys", () => {
	const output = insertCollection({
		source: configSource,
		collection: "plans",
	});
	expect(output).toBe(`import { atmn, feature } from "atmn";

// a comment that must survive
export default atmn({
	features: [
		feature({
			featureId: "messages",
			name: "Messages",
			type: "metered",
			consumable: true,
		}),
	],
	plans: [],
});
`);
});

test("everything before the insertion point is byte-identical", () => {
	const insertBefore = configSource.indexOf("\n});");
	const output = insertCollection({
		source: configSource,
		collection: "plans",
	});
	expect(output?.startsWith(configSource.slice(0, insertBefore))).toBe(true);
});

test("inserts into an empty atmn({}) call", () => {
	const source = "export default atmn({});\n";
	expect(insertCollection({ source, collection: "features" })).toBe(
		"export default atmn({\n\tfeatures: [],\n});\n",
	);
});

test("is idempotent when the key already exists", () => {
	expect(
		insertCollection({ source: configSource, collection: "features" }),
	).toBe(configSource);
});

test("returns null without an atmn call", () => {
	const source = "export default other({ features: [] });\n";
	expect(insertCollection({ source, collection: "features" })).toBeNull();
});

test("appendToCollection succeeds into a freshly inserted collection", () => {
	const withPlans = insertCollection({
		source: configSource,
		collection: "plans",
	});
	expect(withPlans).not.toBeNull();
	const withStarter = appendToCollection({
		source: withPlans as string,
		collection: "plans",
		text: "starter",
	});
	expect(withStarter).toContain("\tplans: [\n\t\tstarter,\n\t],");
});
