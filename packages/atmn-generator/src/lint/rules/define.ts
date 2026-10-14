import type { LintRule } from "../runtime/lintDocument";

type RuleOf<K extends LintRule["kind"]> = Omit<
	Extract<LintRule, { kind: K }>,
	"kind"
>;

export const requiredWhen = (rule: RuleOf<"requiredWhen">): LintRule => ({
	kind: "requiredWhen",
	...rule,
});

export const forbiddenWhen = (rule: RuleOf<"forbiddenWhen">): LintRule => ({
	kind: "forbiddenWhen",
	...rule,
});

export const mutex = (rule: RuleOf<"mutex">): LintRule => ({
	kind: "mutex",
	...rule,
});

export const exactlyOne = (rule: RuleOf<"exactlyOne">): LintRule => ({
	kind: "exactlyOne",
	...rule,
});

export const unique = (rule: RuleOf<"unique">): LintRule => ({
	kind: "unique",
	...rule,
});

export const linkedOnce = (rule: RuleOf<"linkedOnce">): LintRule => ({
	kind: "linkedOnce",
	...rule,
});

export const exactlyOneActive = (
	rule: RuleOf<"exactlyOneActive">,
): LintRule => ({
	kind: "exactlyOneActive",
	...rule,
});

export const exists = (rule: RuleOf<"exists">): LintRule => ({
	kind: "exists",
	...rule,
});

export const compare = (rule: RuleOf<"compare">): LintRule => ({
	kind: "compare",
	...rule,
});

export const valueWhen = (rule: RuleOf<"valueWhen">): LintRule => ({
	kind: "valueWhen",
	...rule,
});

export const targetHas = (rule: RuleOf<"targetHas">): LintRule => ({
	kind: "targetHas",
	...rule,
});

export const refusedWhen = (rule: RuleOf<"refusedWhen">): LintRule => ({
	kind: "refusedWhen",
	...rule,
});

export const targetForbids = (rule: RuleOf<"targetForbids">): LintRule => ({
	kind: "targetForbids",
	...rule,
});

export const targetLacks = (rule: RuleOf<"targetLacks">): LintRule => ({
	kind: "targetLacks",
	...rule,
});

export const nonEmpty = (rule: RuleOf<"nonEmpty">): LintRule => ({
	kind: "nonEmpty",
	...rule,
});

export const rejects = (rule: RuleOf<"rejects">): LintRule => ({
	kind: "rejects",
	...rule,
});

export const knownValues = (rule: RuleOf<"knownValues">): LintRule => ({
	kind: "knownValues",
	...rule,
});

export const notMap = (rule: RuleOf<"notMap">): LintRule => ({
	kind: "notMap",
	...rule,
});

export const uniformPrefix = (rule: RuleOf<"uniformPrefix">): LintRule => ({
	kind: "uniformPrefix",
	...rule,
});
