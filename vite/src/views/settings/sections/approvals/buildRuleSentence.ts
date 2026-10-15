import {
	ACTIONS,
	APPROVAL_AREAS,
	type ApprovalAction,
	type ApprovalArea,
	type ApprovalRule,
	type RuleSubject,
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
	isCancel: boolean;
	/** The object the field sits in, e.g. the grant for `included_grant`'s unit. */
	parent: Filter;
	/** The array element being described, e.g. "Incoming plan". */
	scope: string;
};

type Format = (params: { value: unknown; ctx: Ctx }) => string;

type Field =
	| {
			kind: "match";
			label: (ctx: Ctx) => string;
			format: Format;
			/** Keys the field reads from a nested object; the first holds the matcher. */
			nested?: string[];
	  }
	| { kind: "each"; scope: (ctx: Ctx) => string }
	| { kind: "phrase"; phrase: (value: unknown) => string };

/** Areas whose action labels are bare verbs in S3's catalog, so the list prefixes the area. */
const VERB_ONLY_AREAS = new Set<ApprovalArea>([
	"invoices",
	"customers",
	"api_keys",
	"migrations",
	"members",
]);

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

const fixed = (label: string) => () => label;
const yesNo: Format = ({ value }) => (value ? "Yes" : "No");
const money: Format = ({ value, ctx }) => ctx.labels.money(Number(value));

const match = (
	label: (ctx: Ctx) => string,
	format: Format,
	nested?: string[],
): Field => ({ kind: "match", label, format, nested });

const FIELDS: Record<string, Field> = {
	paid: match(fixed("Charges customer"), yesNo),
	checkout: {
		kind: "phrase",
		phrase: (value) =>
			value ? "Sends a checkout link" : "Doesn't send a checkout link",
	},
	incoming: { kind: "each", scope: fixed("Incoming plan") },
	outgoing: {
		kind: "each",
		scope: ({ isCancel }) => (isCancel ? "Plan" : "Outgoing plan"),
	},
	discounts: { kind: "each", scope: fixed("Discount") },
	plan_id: match(
		({ scope }) => scope,
		({ value, ctx }) => ctx.labels.plan(String(value)),
	),
	recurring: match(({ scope }) => `${scope} is recurring`, yesNo),
	percent_off: match(fixed("Discount percent off"), ({ value }) => `${value}%`),
	free_trial: match(
		fixed("Free trial"),
		({ value, ctx }) =>
			`${value} ${ctx.parent.duration_type}${Number(value) === 1 ? "" : "s"}`,
		["duration_length", "duration_type"],
	),
	cancel_action: match(fixed("Timing"), ({ value }) =>
		String(TIMINGS[String(value)] ?? value),
	),
	refund: match(fixed("Refund"), money, ["amount"]),
	feature_id: match(
		fixed("Feature"),
		({ value, ctx }) => ctx.labels.feature(String(value)).name,
	),
	included_grant: match(fixed("Amount"), ({ value, ctx }) =>
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
	if (!field) return [CUSTOM];
	if (field.kind === "phrase") {
		return [{ field: "", operator: "", value: field.phrase(value) }];
	}
	if (field.kind === "each") {
		const quantifiers = isFilter(value) ? Object.keys(value) : [];
		const element = isFilter(value) ? (value.$every ?? value.$some) : null;
		if (quantifiers.length !== 1 || !isFilter(element)) return [CUSTOM];
		return filterConditions({
			filter: element,
			ctx: { ...ctx, scope: field.scope(ctx) },
		});
	}
	if (!field.nested) {
		return matcherConditions({
			label: field.label(ctx),
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
		label: field.label(ctx),
		matcher: value[field.nested[0]],
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
	const { area, label } = ACTIONS[action];
	if (!VERB_ONLY_AREAS.has(area)) return label;
	return `${APPROVAL_AREAS[area]} · ${label}`;
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
	const isCancel = rule.actions.every(
		(action) => ACTIONS[action].when === "billing_cancel",
	);
	const groups = whenGroups({
		when,
		ctx: { labels, isCancel, parent: when, scope: "" },
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
