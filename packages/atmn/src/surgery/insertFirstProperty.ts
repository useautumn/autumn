import { appendPropertyEdit, holdsSpread } from "./appendPropertyEdit";
import {
	type FixtureConstraint,
	type FixtureShape,
	findFixture,
	fixtureObjectOf,
} from "./findFixture";
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
	builder: FixtureShape;
	idField: string;
	id: string;
	where?: FixtureConstraint[];
	property: string;
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
	if (holdsSpread({ object })) {
		return call
			.getRoot()
			.root()
			.commitEdits([appendPropertyEdit({ source, object, pair: property })]);
	}
	const first = object.namedChildren()[0];
	if (first === undefined) return null;
	const insertAt = first.range().start.index;
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
