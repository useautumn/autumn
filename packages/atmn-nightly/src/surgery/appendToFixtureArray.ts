import { Lang, parse } from "@ast-grep/napi";
import { appendPropertyEdit } from "./appendPropertyEdit";
import { type AppendText, appendElementToArray } from "./appendToArray";
import {
	type FixtureConstraint,
	type FixtureShape,
	findFixture,
	fixtureObjectOf,
} from "./findFixture";

/**
 * Append one element to an array property of a fixture literal
 * (`plan({ variants: [...] })`), seeding the property when absent.
 * Null when the fixture is not there or the property is not an array.
 */
export const appendToFixtureArray = ({
	source,
	builder,
	idField,
	id,
	where,
	property,
	text,
}: {
	source: string;
	builder: FixtureShape;
	idField: string;
	id: string;
	where?: FixtureConstraint[];
	property: string;
	text: AppendText;
}): string | null => {
	const call = findFixture({
		source,
		builder,
		idField,
		id,
		where,
		allowDynamic: true,
	});
	if (call === null) return null;
	const object = fixtureObjectOf(call);
	if (object === null) return null;
	const root = parse(Lang.TypeScript, source).root();

	const pair = object
		.children()
		.find(
			(member) =>
				member.kind() === "pair" &&
				member.namedChildren()[0]?.text() === property,
		);
	if (pair === undefined) {
		// Seed the key, then re-find: the edit shifts every node position.
		const seeded = root.commitEdits([
			appendPropertyEdit({ source, object, pair: `${property}: []` }),
		]);
		return appendToFixtureArray({
			source: seeded,
			builder,
			idField,
			id,
			where,
			property,
			text,
		});
	}
	const array = pair.namedChildren()[1];
	if (array === undefined || array.kind() !== "array") return null;
	return appendElementToArray({ source, root, array, text });
};
