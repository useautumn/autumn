import { expect, test } from "bun:test";
import { Lang, parse } from "@ast-grep/napi";
import {
	findDynamicFixtures,
	staticFixtureRule,
} from "../../src/surgery/staticFixtureRule";

const staticFixture = `		feature({
			featureId: "messages",
			name: "Messages",
			type: "metered",
			consumable: true,
		}),`;

const dynamicFixtures = `		feature(buildIt()),
		feature({ ...base, featureId: "spread" }),
		...ids.map((id) =>
			feature({ featureId: id, name: id, type: "metered", consumable: true })),`;

const mixedSource = `import { atmn, feature } from "atmn";

const buildIt = () => ({ name: "Built" });
const base = { name: "Base" };
const ids = ["a", "b"];

export default atmn({
	features: [
${staticFixture}
${dynamicFixtures}
	],
});
`;

test("staticFixtureRule matches only the static object literal call", () => {
	const root = parse(Lang.TypeScript, mixedSource).root();
	const matches = root.findAll(staticFixtureRule({ builder: "feature" }));
	expect(matches).toHaveLength(1);
	expect(matches[0]?.text()).toContain('featureId: "messages"');
});

test("findDynamicFixtures returns the built, spread, and mapped calls only", () => {
	const dynamic = findDynamicFixtures({
		source: mixedSource,
		builder: "feature",
	});
	expect(dynamic).toHaveLength(3);
	const texts = dynamic.map((node) => node.text());
	expect(texts[0]).toBe("feature(buildIt())");
	expect(texts[1]).toContain("...base");
	expect(texts[2]).toContain("featureId: id");
	for (const text of texts) {
		expect(text).not.toContain('featureId: "messages"');
	}
});

test("a file of only static fixtures has no dynamic ones", () => {
	const staticOnly = `export default atmn({
	features: [
${staticFixture}
	],
});
`;
	expect(
		findDynamicFixtures({ source: staticOnly, builder: "feature" }),
	).toHaveLength(0);
});
