import { expect, test } from "bun:test";
import { insertFirstProperty } from "../../src/surgery/insertFirstProperty";

const configSource = `import { atmn, feature } from "atmn";

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

test("the property becomes the first property at the literal's indent", () => {
	expect(
		insertFirstProperty({
			source: configSource,
			builder: "feature",
			idField: "featureId",
			id: "messages",
			property: 'internalId: "fi_messages"',
		}),
	).toBe(`import { atmn, feature } from "atmn";

export default atmn({
	features: [
		feature({
			internalId: "fi_messages",
			featureId: "messages",
			name: "Messages",
			type: "metered",
			consumable: true,
		}),
	],
});
`);
});

test("idField not first: insertion still lands first", () => {
	const source = `export const seats = feature({
	name: "Seats",
	featureId: "seats",
	type: "metered",
});
`;
	expect(
		insertFirstProperty({
			source,
			builder: "feature",
			idField: "featureId",
			id: "seats",
			property: 'internalId: "fi_seats"',
		}),
	).toBe(`export const seats = feature({
	internalId: "fi_seats",
	name: "Seats",
	featureId: "seats",
	type: "metered",
});
`);
});

test("a $ in the inserted property survives verbatim", () => {
	const output = insertFirstProperty({
		source: configSource,
		builder: "feature",
		idField: "featureId",
		id: "messages",
		property: 'note: "costs 5$ per use"',
	});
	expect(output).toContain('note: "costs 5$ per use"');
	expect(output).not.toContain("$NOTE");
});

test("the other lines are byte-identical", () => {
	const output = insertFirstProperty({
		source: configSource,
		builder: "feature",
		idField: "featureId",
		id: "messages",
		property: 'internalId: "fi_messages"',
	});
	expect(
		output?.startsWith(
			configSource.slice(0, configSource.indexOf("feature({")),
		),
	).toBe(true);
	expect(
		output?.endsWith(
			configSource.slice(configSource.indexOf("\t\t\tfeatureId")),
		),
	).toBe(true);
});

test("fixture not found returns null", () => {
	expect(
		insertFirstProperty({
			source: configSource,
			builder: "feature",
			idField: "featureId",
			id: "nope",
			property: 'internalId: "fi_nope"',
		}),
	).toBeNull();
});

/** A later spread overrides an earlier key at runtime, so a pair inserted
 * before one is silently discarded and the backfill never takes effect. */
test("a leading spread pushes the new property after it", () => {
	const source = `export const pro = plan({ ...base, planId: "pro" });\n`;
	expect(
		insertFirstProperty({
			source,
			builder: "plan",
			idField: "planId",
			id: "pro",
			property: 'internalId: "prod_123"',
		}),
	).toBe(
		`export const pro = plan({ ...base, planId: "pro", internalId: "prod_123" });\n`,
	);
});

test("a trailing spread pushes the new property after it too", () => {
	const source = `export const pro = plan({ planId: "pro", ...base });\n`;
	expect(
		insertFirstProperty({
			source,
			builder: "plan",
			idField: "planId",
			id: "pro",
			property: 'internalId: "prod_123"',
		}),
	).toBe(
		`export const pro = plan({ planId: "pro", ...base, internalId: "prod_123" });\n`,
	);
});

test("a multiline literal with a trailing spread keeps its layout", () => {
	const source = `export const pro = plan({
	planId: "pro",
	...base,
});
`;
	expect(
		insertFirstProperty({
			source,
			builder: "plan",
			idField: "planId",
			id: "pro",
			property: 'internalId: "prod_123"',
		}),
	).toBe(`export const pro = plan({
	planId: "pro",
	...base,
	internalId: "prod_123",
});
`);
});
