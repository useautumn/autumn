import { expect, test } from "bun:test";
import { findFixture } from "../../src/surgery/findFixture";

const configSource = `import { atmn, feature } from "atmn";
import { seats } from "./features";

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

const idFieldLastSource = `import { feature } from "atmn";

export const seats = feature({
	name: "Seats",
	type: "metered",
	consumable: false,
	featureId: "seats",
});
`;

test("findFixture returns the call_expression node", () => {
	const call = findFixture({
		source: configSource,
		builder: "feature",
		idField: "featureId",
		id: "messages",
	});
	expect(call).not.toBeNull();
	expect(call?.kind()).toBe("call_expression");
	expect(call?.text()).toContain('featureId: "messages"');
});

test("idField is matched by value, not by position", () => {
	const call = findFixture({
		source: idFieldLastSource,
		builder: "feature",
		idField: "featureId",
		id: "seats",
	});
	expect(call).not.toBeNull();
	expect(call?.text()).toContain('featureId: "seats"');
});

test("two fixtures in one file: only the named id is found", () => {
	const call = findFixture({
		source: `${configSource}\n${idFieldLastSource}`,
		builder: "feature",
		idField: "featureId",
		id: "seats",
	});
	expect(call?.text()).toContain('featureId: "seats"');
	expect(call?.text()).not.toContain("messages");
});

test("an id containing $ is found", () => {
	const source = `import { feature } from "atmn";
export const odd = feature({
	featureId: "or$er",
	name: "Odd",
	type: "metered",
	consumable: true,
});
`;
	const call = findFixture({
		source,
		builder: "feature",
		idField: "featureId",
		id: "or$er",
	});
	expect(call?.text()).toContain('featureId: "or$er"');
});

test("unknown id, unknown idField, and unknown builder return null", () => {
	expect(
		findFixture({
			source: configSource,
			builder: "feature",
			idField: "featureId",
			id: "nope",
		}),
	).toBeNull();
	expect(
		findFixture({
			source: configSource,
			builder: "feature",
			idField: "planId",
			id: "messages",
		}),
	).toBeNull();
	expect(
		findFixture({
			source: configSource,
			builder: "plan",
			idField: "featureId",
			id: "messages",
		}),
	).toBeNull();
});

test("feature(buildIt()) is not a fixture", () => {
	const source = `const buildIt = () => ({ featureId: "messages" });
export default atmn({ features: [feature(buildIt())] });
`;
	expect(
		findFixture({
			source,
			builder: "feature",
			idField: "featureId",
			id: "messages",
		}),
	).toBeNull();
});

test("a spread fixture is not found even when the id matches", () => {
	const source = `const base = { name: "Base" };
export default atmn({
	features: [feature({ ...base, featureId: "messages" })],
});
`;
	expect(
		findFixture({
			source,
			builder: "feature",
			idField: "featureId",
			id: "messages",
		}),
	).toBeNull();
});

test("a mapped fixture with dynamic values is not found", () => {
	const source = `const ids = ["messages"];
export default atmn({
	features: ids.map((id) =>
		feature({ featureId: id, name: id, type: "metered", consumable: true })),
});
`;
	expect(
		findFixture({
			source,
			builder: "feature",
			idField: "featureId",
			id: "messages",
		}),
	).toBeNull();
});
