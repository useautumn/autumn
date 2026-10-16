import {
	ACTIONS,
	APPROVAL_FILTER_FIELD_LABELS,
	type ApprovalAction,
	type ApprovalRule,
	type ApprovalRuleEffect,
	type RuleSubject,
} from "@autumn/shared";

export type RuleLabels = {
	member: (userId: string) => string;
	role: (roleId: string) => string;
	plan: (planId: string) => string;
	feature: (featureId: string) => { name: string; unit: string };
	money: (amount: number) => string;
};

export type RuleCondition = { field: string; operator: string; value: string };

/** `key` is the part's place in the sentence, stable across renders. */
export type SentencePart = { key: string } & (
	| { kind: "subject"; subject: RuleSubject; text: string }
	| { kind: "action"; text: string }
	| { kind: "word"; text: string }
	| ({ kind: "condition" } & RuleCondition)
);

type Filter = Record<string, unknown>;

type Ctx = {
	labels: RuleLabels;
	effect: ApprovalRuleEffect;
	fieldLabels: Record<string, string>;
	/** Dot path of the object being read, quantifiers left out, e.g. "incoming". */
	path: string;
	/** The object the field sits in, e.g. the grant for `included_grant`'s unit. */
	parent: Filter;
};

/** Formats one matcher operand; null means the list can't word it. */
type Format = (params: { value: unknown; ctx: Ctx }) => string | null;

type Field =
	| { kind: "match"; format: Format }
	| { kind: "each" }
	| { kind: "object"; none?: string; any?: string };

const OPERATORS: Record<string, string> = {
	$eq: "is",
	$ne: "is not",
	$in: "is any of",
	$nin: "is none of",
	$lt: "<",
	$lte: "≤",
	$gt: ">",
	$gte: "≥",
};

const NEGATED: Record<string, string> = {
	is: "is not",
	"is any of": "is none of",
};

export const ENUM_LABELS: Record<string, string> = {
	cancel_end_of_cycle: "End of cycle",
	cancel_immediately: "Immediately",
	end_of_cycle: "End of cycle",
	immediate: "Immediately",
	now: "Reset now",
	unchanged: "Unchanged",
	custom: "Custom date",
};

/** Allow-rule caps on these optional amounts store an extra "or none" branch. */
const CAPPED_FIELDS = new Set(["refund", "next_cycle"]);

const CUSTOM: RuleCondition = {
	field: "",
	operator: "",
	value: "Custom condition",
};

const isFilter = (value: unknown): value is Filter =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const hasNullField = (filter: Filter) =>
	Object.values(filter).some((value) => value === null);

const plural = ({ count, unit }: { count: number; unit: string }) =>
	`${count} ${unit}${count === 1 ? "" : "s"}`;

const yesNo: Format = ({ value }) => (value ? "Yes" : "No");
const money: Format = ({ value, ctx }) => ctx.labels.money(Number(value));
const enumLabel: Format = ({ value }) =>
	ENUM_LABELS[String(value)] ?? String(value);
const duration: Format = ({ value }) =>
	isFilter(value) && typeof value.length === "number"
		? plural({ count: value.length, unit: String(value.unit) })
		: null;

const match = (format: Format): Field => ({ kind: "match", format });

/** How each filter field's value reads; labels come from `APPROVAL_FILTER_FIELD_LABELS` by path. */
const FIELDS: Record<string, Field> = {
	paid: match(yesNo),
	checkout: match(yesNo),
	recurring: match(yesNo),
	customized: match(yesNo),
	has_paid: match(yesNo),
	incoming: { kind: "each" },
	outgoing: { kind: "each" },
	discounts: { kind: "each" },
	customer: { kind: "object" },
	entity: { kind: "object", none: "none", any: "any" },
	free_trial: { kind: "object", none: "none", any: "any" },
	refund: { kind: "object" },
	next_cycle: { kind: "object" },
	duration: match(duration),
	plan_id: match(({ value, ctx }) => ctx.labels.plan(String(value))),
	percent_off: match(({ value }) => `${value}%`),
	cancel_action: match(enumLabel),
	plan_schedule: match(enumLabel),
	billing_cycle_anchor: match(enumLabel),
	amount: match(money),
	total: match(money),
	feature_id: match(({ value, ctx }) => ctx.labels.feature(String(value)).name),
	included_grant: match(({ value, ctx }) =>
		[value, ctx.labels.feature(String(ctx.parent.feature_id)).unit]
			.filter(Boolean)
			.join(" "),
	),
};

/** A bare value reads as "is"; a matcher gives one condition per operator, so ranges keep both limits. */
const matcherConditions = ({
	label,
	matcher,
	format,
	ctx,
}: {
	label: string;
	matcher: unknown;
	format: Format;
	ctx: Ctx;
}): RuleCondition[] => {
	const entries = isFilter(matcher)
		? Object.entries(matcher)
		: [["$eq", matcher]];
	const conditions = entries.map(([operator, operand]) => {
		const values = [operand].flat().map((value) => format({ value, ctx }));
		if (values.includes(null)) return CUSTOM;
		return {
			field: label,
			operator: OPERATORS[String(operator)] ?? String(operator),
			value: values.join(", "),
		};
	});
	return conditions.includes(CUSTOM) ? [CUSTOM] : conditions;
};

/** Only the effect's quantifier is worded: `$every` for allow, `$some` for block, and `$none` for "is not" a plan. */
const elementConditions = ({
	value,
	ctx,
}: {
	value: unknown;
	ctx: Ctx;
}): RuleCondition[] => {
	const [quantifier, ...others] = isFilter(value) ? Object.keys(value) : [];
	const element = isFilter(value) ? value[quantifier] : null;
	if (others.length > 0 || !isFilter(element)) return [CUSTOM];
	if (quantifier === "$none") {
		if (Object.keys(element).join() !== "plan_id") return [CUSTOM];
		return filterConditions({ filter: element, ctx }).map((condition) =>
			NEGATED[condition.operator]
				? { ...condition, operator: NEGATED[condition.operator] }
				: CUSTOM,
		);
	}
	const effectQuantifier = ctx.effect === "block" ? "$some" : "$every";
	if (quantifier !== effectQuantifier) return [CUSTOM];
	return filterConditions({ filter: element, ctx });
};

/** `null` and `{ $ne: null }` read as a phrase; otherwise every nested key must be worded. */
const objectConditions = ({
	field,
	value,
	label,
	ctx,
}: {
	field: Extract<Field, { kind: "object" }>;
	value: unknown;
	label: string | undefined;
	ctx: Ctx;
}): RuleCondition[] => {
	const isAny =
		isFilter(value) &&
		Object.keys(value).join() === "$ne" &&
		value.$ne === null;
	const phrase = value === null ? field.none : isAny ? field.any : undefined;
	if (phrase && label) return [{ field: label, operator: "is", value: phrase }];
	if (!isFilter(value) || isAny || Object.keys(value).length === 0)
		return [CUSTOM];
	const conditions = filterConditions({ filter: value, ctx });
	return conditions.includes(CUSTOM) ? [CUSTOM] : conditions;
};

const fieldConditions = ({
	key,
	value,
	ctx,
}: {
	key: string;
	value: unknown;
	ctx: Ctx;
}): RuleCondition[] => {
	const field = FIELDS[key];
	const path = ctx.path ? `${ctx.path}.${key}` : key;
	const label = ctx.fieldLabels[path];
	const inField = { ...ctx, path };
	if (!field) return [CUSTOM];
	if (field.kind === "each") return elementConditions({ value, ctx: inField });
	if (field.kind === "object") {
		return objectConditions({ field, value, label, ctx: inField });
	}
	if (!label) return [CUSTOM];
	return matcherConditions({
		label,
		matcher: value,
		format: field.format,
		ctx,
	});
};

const filterConditions = ({
	filter,
	ctx,
}: {
	filter: Filter;
	ctx: Ctx;
}): RuleCondition[] =>
	Object.entries(filter).flatMap(([key, value]) => {
		const inFilter = { ...ctx, parent: filter };
		if (key === "$or")
			return cappedConditions({ branches: value, ctx: inFilter });
		return fieldConditions({ key, value, ctx: inFilter });
	});

/** An allow rule's cap on an optional amount is `$or: [{ refund: null }, { refund: … }]`; it reads as its last branch. */
const cappedConditions = ({
	branches,
	ctx,
}: {
	branches: unknown;
	ctx: Ctx;
}): RuleCondition[] => {
	if (ctx.effect !== "allow" || !Array.isArray(branches)) return [CUSTOM];
	if (!branches.every(isFilter)) return [CUSTOM];
	const keys = new Set(branches.flatMap((branch) => Object.keys(branch)));
	const [key] = keys;
	const caps = branches.filter((branch) => !hasNullField(branch));
	const isCap =
		keys.size === 1 &&
		CAPPED_FIELDS.has(key) &&
		branches.every((branch) => Object.keys(branch).length === 1) &&
		caps.length === branches.length - 1;
	const widest = caps.at(-1);
	if (!isCap || !widest) return [CUSTOM];
	return filterConditions({ filter: widest, ctx });
};

/** Top-level `$or` branches are the editor's OR groups, unless they're a single capped field. */
const filterGroups = ({ filter, ctx }: { filter: Filter; ctx: Ctx }) => {
	const { $or: branches, ...rest } = filter;
	const isGroups =
		Array.isArray(branches) &&
		Object.keys(rest).length === 0 &&
		branches.every((branch) => isFilter(branch) && !hasNullField(branch));
	const groups: Filter[] = isGroups ? branches : [filter];
	return groups.map((group) =>
		Object.keys(group).length === 0
			? [CUSTOM]
			: filterConditions({ filter: group, ctx }),
	);
};

const subjectText = ({
	subject,
	labels,
}: {
	subject: RuleSubject;
	labels: RuleLabels;
}) => {
	if (subject.type === "everyone") return "Everyone";
	if (subject.type === "role") return labels.role(subject.role_id);
	return labels.member(subject.user_id);
};

/** Areas whose labels are bare verbs carry a `sentence_label` that names the object. */
const actionText = (action: ApprovalAction) => {
	const definition: { label: string; sentence_label?: string } =
		ACTIONS[action];
	return definition.sentence_label ?? definition.label;
};

const word = (text: string, key = text): SentencePart => ({
	kind: "word",
	key,
	text,
});

const filterParts = ({
	rule,
	labels,
}: {
	rule: ApprovalRule;
	labels: RuleLabels;
}): SentencePart[] => {
	const filter: Filter | null = rule.filter;
	const shape = ACTIONS[rule.actions[0]]?.filter;
	if (!filter || !shape || Object.keys(filter).length === 0) return [];
	const groups = filterGroups({
		filter,
		ctx: {
			labels,
			effect: rule.effect,
			fieldLabels: APPROVAL_FILTER_FIELD_LABELS[shape],
			path: "",
			parent: filter,
		},
	});
	return [
		word("when"),
		...groups.flatMap((conditions, group) => [
			...(group > 0 ? [word("or", `or-${group}`)] : []),
			...conditions.flatMap((condition, i): SentencePart[] => [
				...(i > 0 ? [word("and", `and-${group}-${i}`)] : []),
				{ kind: "condition", key: `condition-${group}-${i}`, ...condition },
			]),
		]),
	];
};

export const buildRuleSentence = ({
	rule,
	labels,
}: {
	rule: ApprovalRule;
	labels: RuleLabels;
}): SentencePart[] => [
	...rule.subjects.map(
		(subject, i): SentencePart => ({
			kind: "subject",
			key: `subject-${i}`,
			subject,
			text: subjectText({ subject, labels }),
		}),
	),
	word(rule.effect === "block" ? "can't" : "can", "effect"),
	...rule.actions.map(
		(action): SentencePart => ({
			kind: "action",
			key: action,
			text: actionText(action),
		}),
	),
	...filterParts({ rule, labels }),
];
