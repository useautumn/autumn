import { Lang, parse } from "@ast-grep/napi";
import {
	type FixtureConstraint,
	type FixtureShape,
	findFixture,
	fixtureObjectOf,
} from "./findFixture";

/** Overwrite one top-level property's value in a fixture literal; null when
 * the fixture or the property is not there. */
export const setFixtureProperty = ({
	source,
	builder,
	idField,
	id,
	where,
	property,
	value,
}: {
	source: string;
	builder: FixtureShape;
	idField: string;
	id: string;
	where?: FixtureConstraint[];
	property: string;
	value: string;
}): string | null => {
	// A splice keeps every other byte, so a literal the pull rewriter refuses
	// (it names another fixture) still takes the new value.
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
	for (const member of object.children()) {
		if (member.kind() !== "pair") continue;
		const [key, current] = member.namedChildren();
		if (key?.text() !== property || current === undefined) continue;
		const root = parse(Lang.TypeScript, source).root();
		return root.commitEdits([
			{
				startPos: current.range().start.index,
				endPos: current.range().end.index,
				insertedText: JSON.stringify(value),
			},
		]);
	}
	return null;
};
