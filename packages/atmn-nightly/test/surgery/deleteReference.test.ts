import { expect, test } from "bun:test";
import { deleteReference } from "../../src/surgery/deleteReference";

const configSource = `import { atmn, feature } from "atmn";
import { seats } from "./features";
import { seatsBackup, seats } from "./more";

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
});
`;

test("array elements go, a sole-specifier import line goes, multi-specifier imports shrink", () => {
	expect(
		deleteReference({ source: configSource, name: "seats" }),
	).toBe(`import { atmn, feature } from "atmn";
import { seatsBackup } from "./more";

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
`);
});

test("the last array element without a trailing comma is removed", () => {
	const source = `export default atmn({
	features: [
		feature({
			featureId: "messages",
		}),
		seats
	],
});
`;
	expect(deleteReference({ source, name: "seats" })).toBe(
		'export default atmn({\n\tfeatures: [\n\t\tfeature({\n\t\t\tfeatureId: "messages",\n\t\t}),\n\t],\n});\n',
	);
});

test("the sole array element collapses the array to []", () => {
	const source = `import { seats } from "./features";

export default atmn({
	features: [seats],
});
`;
	expect(deleteReference({ source, name: "seats" })).toBe(
		"\nexport default atmn({\n\tfeatures: [],\n});\n",
	);
});

test("identifiers that are not array elements or import specifiers stay", () => {
	const source = `const seats = { seats: 1 };
const named = { seats };
const value = seats;
`;
	expect(deleteReference({ source, name: "seats" })).toBe(source);
});

test("a name that appears nowhere returns the source unchanged", () => {
	expect(deleteReference({ source: configSource, name: "ghost" })).toBe(
		configSource,
	);
});
