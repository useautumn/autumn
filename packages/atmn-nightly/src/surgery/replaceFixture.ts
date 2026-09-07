import { type FixtureConstraint, findFixture } from "./findFixture";

export const replaceFixture = ({
	source,
	builder,
	idField,
	id,
	where,
	text,
}: {
	source: string;
	builder: string;
	idField: string;
	id: string;
	where?: FixtureConstraint[];
	text: string;
}): string | null => {
	const call = findFixture({ source, builder, idField, id, where });
	if (call === null) return null;
	const { start, end } = call.range();
	// Raw byte splice, not replace(): replace() treats `$` as a metavariable.
	return call
		.getRoot()
		.root()
		.commitEdits([
			{ startPos: start.index, endPos: end.index, insertedText: text },
		]);
};
