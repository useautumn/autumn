import { type FixtureConstraint, findFixture } from "./findFixture";
import { lineStartOf } from "./fixtureEdit";

export const insertFirstProperty = ({
	source,
	builder,
	idField,
	id,
	where,
	property,
}: {
	source: string;
	builder: string;
	idField: string;
	id: string;
	where?: FixtureConstraint[];
	property: string;
}): string | null => {
	const call = findFixture({ source, builder, idField, id, where });
	if (call === null) return null;
	const object = call.find({ rule: { kind: "object" } });
	if (object === null) return null;
	const first = object.namedChildren()[0];
	if (first === undefined) return null;
	const insertAt = first.range().start.index;
	// The object spans lines: the existing whitespace before the first property
	// already indents it, so the new property takes that indent on its own line.
	const spansLines = source
		.slice(object.range().start.index, insertAt)
		.includes("\n");
	if (!spansLines) {
		return call
			.getRoot()
			.root()
			.commitEdits([
				{ startPos: insertAt, endPos: insertAt, insertedText: `${property}, ` },
			]);
	}
	const indent = source.slice(lineStartOf(source, insertAt), insertAt);
	return call
		.getRoot()
		.root()
		.commitEdits([
			{
				startPos: insertAt,
				endPos: insertAt,
				insertedText: `${property},\n${indent}`,
			},
		]);
};
