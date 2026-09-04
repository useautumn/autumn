import type { LintRule } from "../runtime/lintDocument";

/**
 * Typed identity functions, like the fixture builders: autocomplete while
 * writing a rule, and `because` cannot be forgotten — it is what gets printed.
 */

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

/** At most one of the fields. */
export const mutex = (rule: RuleOf<"mutex">): LintRule => ({
	kind: "mutex",
	...rule,
});

/** Precisely one of the fields. */
export const exactlyOne = (rule: RuleOf<"exactlyOne">): LintRule => ({
	kind: "exactlyOne",
	...rule,
});

/** No two entries of the collection share the field's value. */
export const unique = (rule: RuleOf<"unique">): LintRule => ({
	kind: "unique",
	...rule,
});

/** The field names an entry of another top-level collection. */
export const exists = (rule: RuleOf<"exists">): LintRule => ({
	kind: "exists",
	...rule,
});

export const compare = (rule: RuleOf<"compare">): LintRule => ({
	kind: "compare",
	...rule,
});

/** `field` must equal `mustBe` when `when` is `equals`. */
export const valueWhen = (rule: RuleOf<"valueWhen">): LintRule => ({
	kind: "valueWhen",
	...rule,
});

/** `field` names a row of top-level collection `in`; that row's `target` must equal `equals`. */
export const targetHas = (rule: RuleOf<"targetHas">): LintRule => ({
	kind: "targetHas",
	...rule,
});
