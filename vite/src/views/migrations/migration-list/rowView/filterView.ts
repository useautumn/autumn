import type { MigrationFilter } from "@autumn/shared";
import { buildGroups } from "../../migration/filters/FilterForm";
import {
	type FilterField,
	type FilterRule,
	parsePlanKey,
} from "../../migration/filters/filterRowTypes";
import {
	type ChipView,
	type MigrationCatalog,
	pluralize,
	withoutTile,
} from "./chipView";

type FilterRowView = { label: string; chips: ChipView[] };

export type FilterView = {
	head: ChipView;
	extraCount: number;
	groups: FilterRowView[][];
};

type RuleView = { subject: string; cell: ChipView; chips: ChipView[] };

const BOOLEAN_RULES: Partial<
	Record<FilterField, { tile: ChipView["tile"]; yes: string; no: string }>
> = {
	paid: {
		tile: { tone: "amber", glyph: "currencyDollar" },
		yes: "Paid",
		no: "Free",
	},
	recurring: {
		tile: { tone: "blue", glyph: "arrowsClockwise" },
		yes: "Recurring",
		no: "One-off",
	},
	custom: {
		tile: { tone: "purple", glyph: "wrench" },
		yes: "Custom",
		no: "Not custom",
	},
};

const OPERATOR_WORDS: Record<string, string> = {
	is: "is",
	in: "in",
	is_not: "is not",
	not_in: "not in",
};

const isNegated = (rule: FilterRule) =>
	rule.operator === "is_not" || rule.operator === "not_in";

const planChips = ({
	rule,
	catalog,
}: {
	rule: FilterRule;
	catalog: MigrationCatalog;
}): ChipView[] => {
	const versionsByPlan = new Map<string, number[]>();
	for (const key of rule.values) {
		const { planId, version } = parsePlanKey(key);
		const versions = versionsByPlan.get(planId) ?? [];
		if (version !== undefined) versions.push(version);
		versionsByPlan.set(planId, versions);
	}
	return [...versionsByPlan].map(([planId, versions]) => ({
		label: catalog.planName(planId),
		details: versions.length
			? [
					versions
						.sort((a, b) => a - b)
						.map((version) => `v${version}`)
						.join(", "),
				]
			: undefined,
	}));
};

const planRuleView = ({
	rule,
	catalog,
}: {
	rule: FilterRule;
	catalog: MigrationCatalog;
}): RuleView => {
	if (rule.operator === "none") {
		const noPlan: ChipView = {
			label: "No plan",
			tile: { tone: "neutral", glyph: "prohibit" },
		};
		return { subject: "Plan", cell: noPlan, chips: [noPlan] };
	}
	const chips = planChips({ rule, catalog });
	const prefix = isNegated(rule) ? "not" : undefined;
	const [first] = chips;
	const extraPlans = chips.length > 1 ? [`+${chips.length - 1}`] : [];
	const cellDetails = [...(first.details ?? []), ...extraPlans];
	return {
		subject: `Plan ${OPERATOR_WORDS[rule.operator]}`,
		cell: {
			...first,
			prefix,
			details: cellDetails.length > 0 ? cellDetails : undefined,
		},
		chips: chips.map((chip) => ({ ...chip, prefix })),
	};
};

const customerRuleView = (rule: FilterRule): RuleView => {
	const excluded = isNegated(rule);
	const chip: ChipView = {
		label:
			rule.values.length === 1
				? rule.values[0]
				: pluralize({ count: rule.values.length, noun: "customer" }),
		tile: { tone: "blue", glyph: excluded ? "userMinus" : "person" },
		details: excluded ? ["excluded"] : undefined,
	};
	return {
		subject: `Customer ${OPERATOR_WORDS[rule.operator]}`,
		cell: chip,
		chips: [chip],
	};
};

const propertyRuleView = (rule: FilterRule): RuleView => {
	const booleanRule = BOOLEAN_RULES[rule.field];
	const chip: ChipView = booleanRule
		? {
				label: rule.values[0] === "true" ? booleanRule.yes : booleanRule.no,
				tile: booleanRule.tile,
			}
		: {
				label: rule.operator === "exists" ? "Has base price" : "No base price",
				tile: { tone: "amber", glyph: "currencyCircleDollar" },
			};
	return {
		subject: booleanRule ? "Plan is" : "Base price",
		cell: chip,
		chips: [chip],
	};
};

const toRuleView = ({
	rule,
	catalog,
}: {
	rule: FilterRule;
	catalog: MigrationCatalog;
}): RuleView => {
	if (rule.field === "plan_id") return planRuleView({ rule, catalog });
	if (rule.field === "customer_id") return customerRuleView(rule);
	return propertyRuleView(rule);
};

const isFilledRule = (rule: FilterRule) =>
	rule.values.some((value) => value.trim().length > 0) ||
	["none", "exists", "not_exists"].includes(rule.operator);

const rowLabel = ({
	subject,
	groupIndex,
	ruleIndex,
}: {
	subject: string;
	groupIndex: number;
	ruleIndex: number;
}): string => {
	if (ruleIndex > 0) return `And ${subject.toLowerCase()}`;
	return groupIndex === 0 ? `Where ${subject.toLowerCase()}` : subject;
};

export const deriveFilterView = ({
	filter,
	catalog,
}: {
	filter: MigrationFilter | null;
	catalog: MigrationCatalog;
}): FilterView | null => {
	if (!filter?.customer) return null;

	const ruleGroups = buildGroups(filter)
		.map((group) =>
			[
				...group.rules.filter((rule) => rule.field !== "customer_id"),
				...group.rules.filter((rule) => rule.field === "customer_id"),
			]
				.filter(isFilledRule)
				.map((rule) => toRuleView({ rule, catalog })),
		)
		.filter((group) => group.length > 0);
	const [firstGroup] = ruleGroups;
	if (!firstGroup) return null;

	return {
		head: withoutTile(firstGroup[0].cell),
		extraCount: ruleGroups.flat().length - 1,
		groups: ruleGroups.map((group, groupIndex) =>
			group.map((rule, ruleIndex) => ({
				label: rowLabel({ subject: rule.subject, groupIndex, ruleIndex }),
				chips: rule.chips,
			})),
		),
	};
};
