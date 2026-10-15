import {
	ACTIONS,
	type ApprovalAction,
	type ApprovalRule,
	type RuleSubject,
	WHEN_FIELD_LABELS,
} from "@autumn/shared";

export type RuleLabels = {
	member: (userId: string) => string;
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
	/** S3's labels for the rule's `when` shape, keyed by dot path. */
	fieldLabels: Record<string, string>;
	/** The object the field sits in, e.g. the grant for `included_grant`'s unit. */
	parent: Filter;
	/** Dot path of the object being read, quantifiers left out, e.g. "incoming". */
	path: string;
};

type Format = (params: { value: unknown; ctx: Ctx }) => string;

type Field =
	| {
			kind: "match";
			format: Format;
			/** Keys the field reads from a nested object; the first holds the matcher. */
			nested?: string[];
	  }
	| { kind: "each" };

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

const TIMINGS: Record<string, string> = {
	cancel_end_of_cycle: "End of cycle",
	cancel_immediately: "Immediately",
	end_of_cycle: "End of cycle",
	immediate: "Immediately",
};

const CUSTOM: RuleCondition = {
	field: "",
	operator: "",
	value: "Custom condition",
};

const isFilter = (value: unknown): value is Filter =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const hasNullField = (filter: Filter) =>
	Object.values(filter).some((value) => value === null);

const yesNo: Format = ({ value }) => (value ? "Yes" : "No");
const money: Format = ({ value, ctx }) => ctx.labels.money(Number(value));
const timing: Format = ({ value }) => TIMINGS[String(value)] ?? String(value);

const match = (format: Format, nested?: string[]): Field => ({
	kind: "match",
	format,
	nested,
});
const each: Field = { kind: "each" };

/** How each `when` field's value reads; its label comes from S3's `WHEN_FIELD_LABELS`. */
const FIELDS: Record<string, Field> = {
	paid: match(yesNo),
	checkout: match(yesNo),
	recurring: match(yesNo),
	incoming: each,
	outgoing: each,
	discounts: each,
	plan_id: match(({ value, ctx }) => ctx.labels.plan(String(value))),
	percent_off: match(({ value }) => `${value}%`),
	free_trial: match(
		({ value, ctx }) =>
			`${value} ${ctx.parent.duration_type}${Number(value) === 1 ? "" : "s"}`,
		["duration_length", "duration_type"],
	),
	cancel_action: match(timing),
	plan_schedule: match(timing),
	refund: match(money, ["amount"]),
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
	if (!isFilter(matcher)) {
		return [
			{ field: label, operator: "is", value: format({ value: matcher, ctx }) },
		];
	}
	return Object.entries(matcher).map(([operator, operand]) => ({
		field: label,
		operator: OPERATORS[operator] ?? operator,
		value: [operand]
			.flat()
			.map((value) => format({ value, ctx }))
			.join(", "),
	}));
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
	if (!field) return [CUSTOM];
	if (field.kind === "each") {
		const quantifiers = isFilter(value) ? Object.keys(value) : [];
		const element = isFilter(value) ? (value.$every ?? value.$some) : null;
		if (quantifiers.length !== 1 || !isFilter(element)) return [CUSTOM];
		return filterConditions({ filter: element, ctx: { ...ctx, path } });
	}
	const [matcherKey] = field.nested ?? [];
	const label = ctx.fieldLabels[matcherKey ? `${path}.${matcherKey}` : path];
	if (!label) return [CUSTOM];
	if (!matcherKey) {
		return matcherConditions({
			label,
			matcher: value,
			format: field.format,
			ctx,
		});
	}
	const nestedKeys = new Set(field.nested);
	const readsWholeObject =
		isFilter(value) && Object.keys(value).every((key) => nestedKeys.has(key));
	if (!readsWholeObject) return [CUSTOM];
	return matcherConditions({
		label,
		matcher: value[matcherKey],
		format: field.format,
		ctx: { ...ctx, parent: value },
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

/** `$or: [{ x: null }, { x: … }, …]` on one field is a cap that lets "no x" through; the editor shows its widest branch, stored last. */
const cappedConditions = ({
	branches,
	ctx,
}: {
	branches: unknown;
	ctx: Ctx;
}): RuleCondition[] => {
	if (!Array.isArray(branches) || !branches.every(isFilter)) return [CUSTOM];
	const keys = new Set(branches.flatMap((branch) => Object.keys(branch)));
	const caps = branches.filter((branch) => !hasNullField(branch));
	const isCap =
		keys.size === 1 &&
		branches.every((branch) => Object.keys(branch).length === 1) &&
		caps.length === branches.length - 1;
	const widest = caps.at(-1);
	if (!isCap || !widest) return [CUSTOM];
	return filterConditions({ filter: widest, ctx });
};

/** Top-level `$or` branches are the editor's OR groups, unless they're a single capped field. */
const whenGroups = ({ when, ctx }: { when: Filter; ctx: Ctx }) => {
	const { $or: branches, ...rest } = when;
	const isGroups =
		Array.isArray(branches) &&
		Object.keys(rest).length === 0 &&
		branches.every((branch) => isFilter(branch) && !hasNullField(branch));
	const groups: Filter[] = isGroups ? branches : [when];
	return groups.map((filter) => filterConditions({ filter, ctx }));
};

const actionText = (action: ApprovalAction) => {
	const definition: { label: string; sentence_label?: string } =
		ACTIONS[action];
	return definition.sentence_label ?? definition.label;
};

const subjectText = ({
	subject,
	labels,
}: {
	subject: RuleSubject;
	labels: RuleLabels;
}) => {
	if (subject.type === "everyone") return "Everyone";
	if (subject.type === "role") {
		return subject.role.charAt(0).toUpperCase() + subject.role.slice(1);
	}
	return labels.member(subject.user_id);
};

const word = (text: string, key = text): SentencePart => ({
	kind: "word",
	key,
	text,
});

const whenParts = ({
	rule,
	labels,
}: {
	rule: ApprovalRule;
	labels: RuleLabels;
}): SentencePart[] => {
	const when: Filter | null = rule.when;
	if (!when || Object.keys(when).length === 0) return [];
	const area = ACTIONS[rule.actions[0]].when;
	if (!area) return [];
	const groups = whenGroups({
		when,
		ctx: {
			labels,
			fieldLabels: WHEN_FIELD_LABELS[area],
			parent: when,
			path: "",
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
	word("can"),
	...rule.actions.map(
		(action): SentencePart => ({
			kind: "action",
			key: action,
			text: actionText(action),
		}),
	),
	...whenParts({ rule, labels }),
];
