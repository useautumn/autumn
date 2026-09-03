import type { NapiConfig, SgNode } from "@ast-grep/napi";
import { Lang, parse } from "@ast-grep/napi";
import { dynamicValueKinds } from "./fixtureEdit";

/**
 * Matches only `<builder>(<static object literal>)`: exactly one argument that is
 * an object with no identifier, member, call, spread, or computed value inside.
 * A blacklist, not a whitelist — ast-grep has no "every value is a literal".
 */
export const staticFixtureRule = ({
	builder,
}: {
	builder: string;
}): NapiConfig => ({
	rule: {
		all: [{ kind: "call_expression" }, { pattern: `${builder}($ARGUMENTS)` }],
	},
	constraints: {
		ARGUMENTS: {
			kind: "object",
			not: {
				any: dynamicValueKinds.map((dynamicKind) => ({
					has: { kind: dynamicKind, stopBy: "end" },
				})),
			},
		},
	},
});

export const findDynamicFixtures = ({
	source,
	builder,
}: {
	source: string;
	builder: string;
}): Array<SgNode> => {
	const root = parse(Lang.TypeScript, source).root();
	const staticIds = new Set(
		root.findAll(staticFixtureRule({ builder })).map((node) => node.id()),
	);
	return root
		.findAll({
			rule: {
				all: [{ kind: "call_expression" }, { pattern: `${builder}($$$)` }],
			},
		})
		.filter((node) => !staticIds.has(node.id()));
};
