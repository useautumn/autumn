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
	allowDynamic = false,
}: {
	source: string;
	builder: string;
	idField: string;
	id: string;
	where?: FixtureConstraint[];
	/** Match a literal built from spreads or calls too: to name it, not to edit it. */
	allowDynamic?: boolean;
}): SgNode | null => {
	const root = parse(Lang.TypeScript, source).root();
	const expected = JSON.stringify(id);
	// A rule walk rather than a pattern: a pattern misses an object whose id
	// pair follows a spread, and the fixture must be found to be refused.
	for (const call of root.findAll({ rule: { kind: "call_expression" } })) {
		if (call.field("function")?.text() !== builder) continue;
		const object = call.field("arguments")?.namedChildren()[0];
		if (object === undefined || object.kind() !== "object") continue;
		const idValue = topLevelPairValue({ object, key: idField });
		if (
			idValue === null ||
			idValue.kind() !== "string" ||
			idValue.text() !== expected
		)
			continue;
		if (!allowDynamic && containsDynamicValue(object)) continue;
		if (where !== undefined && !satisfiesFixtureConstraints({ object, where }))
			continue;
		return call;
	}
	return null;
};

/** The value of the object's own `key: value` member, ignoring nested objects. */
const topLevelPairValue = ({
	object,
	key,
}: {
	object: SgNode;
	key: string;
}): SgNode | null => {
	for (const member of object.children()) {
		if (member.kind() !== "pair") continue;
		const [name, value] = member.namedChildren();
		if (name?.text() === key && value !== undefined) return value;
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
