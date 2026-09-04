import type { SgNode } from "@ast-grep/napi";
import { Lang, parse } from "@ast-grep/napi";
import { containsDynamicValue } from "./fixtureEdit";

/** A property the matched literal must hold; an absent one may count as a default. */
export type FixtureConstraint = {
	field: string;
	equals: string;
	absentMeans?: string;
};

/**
 * The double `$$$` puts `idField` anywhere among the properties; a bare
 * `idField: $VALUE` pattern would parse as a labeled statement and match nothing.
 */
const fixturePattern = ({
	builder,
	idField,
}: {
	builder: string;
	idField: string;
}): string => `${builder}({ $$$, ${idField}: $VALUE, $$$ })`;

export const findFixture = ({
	source,
	builder,
	idField,
	id,
	where,
}: {
	source: string;
	builder: string;
	idField: string;
	id: string;
	where?: FixtureConstraint[];
}): SgNode | null => {
	const root = parse(Lang.TypeScript, source).root();
	const expected = JSON.stringify(id);
	for (const call of root.findAll({
		rule: {
			all: [
				{ kind: "call_expression" },
				{ pattern: fixturePattern({ builder, idField }) },
			],
		},
	})) {
		const value = call.getMatch("VALUE");
		if (
			value === null ||
			value.kind() !== "string" ||
			value.text() !== expected
		)
			continue;
		const object = call.find({ rule: { kind: "object" } });
		if (object === null || containsDynamicValue(object)) continue;
		if (where !== undefined && !satisfiesFixtureConstraints({ object, where }))
			continue;
		return call;
	}
	return null;
};

const satisfiesFixtureConstraints = ({
	object,
	where,
}: {
	object: SgNode;
	where: FixtureConstraint[];
}): boolean =>
	where.every((constraint) => satisfiesConstraint({ object, constraint }));

const satisfiesConstraint = ({
	object,
	constraint,
}: {
	object: SgNode;
	constraint: FixtureConstraint;
}): boolean => {
	const pair = object
		.children()
		.find(
			(child) =>
				child.kind() === "pair" &&
				child.namedChildren()[0]?.text() === constraint.field,
		);
	if (pair === undefined) return constraint.absentMeans === constraint.equals;
	const value = pair.namedChildren()[1];
	return (
		value !== undefined &&
		value.kind() === "string" &&
		value.text() === JSON.stringify(constraint.equals)
	);
};
