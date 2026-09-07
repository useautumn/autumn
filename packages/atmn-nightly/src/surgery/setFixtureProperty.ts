import { Lang, parse } from "@ast-grep/napi";
import { type FixtureConstraint, findFixture } from "./findFixture";

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
	builder: string;
	idField: string;
	id: string;
	where?: FixtureConstraint[];
	property: string;
	value: string;
}): string | null => {
	const call = findFixture({ source, builder, idField, id, where });
	if (call === null) return null;
	const object = call.find({ rule: { kind: "object" } });
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
