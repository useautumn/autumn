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
	// A rule walk rather than a pattern: a pattern misses an object whose id
	// pair follows a spread, and the fixture must be found to be refused.
	for (const call of root.findAll({ rule: { kind: "call_expression" } })) {
		if (call.field("function")?.text() !== builder) continue;
		const object = call.field("arguments")?.namedChildren()[0];
		if (object === undefined || object.kind() !== "object") continue;
		const idValue = topLevelPairValue({ object, key: idField });
		if (idValue === null || stringLiteralValue(idValue) !== id) continue;
		if (!allowDynamic && containsDynamicValue(object)) continue;
		if (where !== undefined && !satisfiesFixtureConstraints({ object, where }))
			continue;
		return call;
	}
	return null;
};

const SIMPLE_ESCAPES: Record<string, string> = {
	n: "\n",
	t: "\t",
	r: "\r",
	b: "\b",
	f: "\f",
	v: "\v",
	"0": "\0",
};

const CODE_POINT_ESCAPE = /^u\{([0-9a-fA-F]{1,6})\}/;
const CODE_UNIT_ESCAPE = /^u([0-9a-fA-F]{4})/;
const HEX_ESCAPE = /^x([0-9a-fA-F]{2})/;

/** A quoted string's body as the runtime reads it, so `'a\\'b'` and `"a'b"`
 * name one fixture. */
const decodeStringBody = (body: string): string => {
	let decoded = "";
	let index = 0;
	while (index < body.length) {
		const char = body[index] ?? "";
		if (char !== "\\") {
			decoded += char;
			index += 1;
			continue;
		}
		const rest = body.slice(index + 1);
		const numeric =
			CODE_POINT_ESCAPE.exec(rest) ??
			CODE_UNIT_ESCAPE.exec(rest) ??
			HEX_ESCAPE.exec(rest);
		if (numeric !== null) {
			decoded += String.fromCodePoint(Number.parseInt(numeric[1] ?? "0", 16));
			index += 1 + numeric[0].length;
			continue;
		}
		const escaped = rest[0];
		if (escaped === undefined) return decoded;
		decoded += SIMPLE_ESCAPES[escaped] ?? escaped;
		index += 2;
	}
	return decoded;
};

/**
 * The text a string node stands for, so `'pro'` and `"pro"` name one fixture.
 * Null for anything else — a template literal is a computed value, not an id.
 */
const stringLiteralValue = (node: SgNode): string | null => {
	if (node.kind() !== "string") return null;
	const text = node.text();
	const quote = text[0];
	if (quote !== '"' && quote !== "'") return null;
	if (text.length < 2 || !text.endsWith(quote)) return null;
	return decodeStringBody(text.slice(1, -1));
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
	return value !== undefined && stringLiteralValue(value) === constraint.equals;
};
