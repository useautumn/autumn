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
