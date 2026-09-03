import type { SgNode } from "@ast-grep/napi";
import { Lang, parse } from "@ast-grep/napi";
import { containsDynamicValue } from "./fixtureEdit";

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
}: {
	source: string;
	builder: string;
	idField: string;
	id: string;
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
		return call;
	}
	return null;
};
