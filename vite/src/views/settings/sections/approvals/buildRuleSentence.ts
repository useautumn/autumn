import type {
	ActionFilter,
	ApprovalAction,
	ApprovalRule,
	RuleSubject,
} from "./approvalRuleTypes";

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

export const ACTION_LABELS: Record<ApprovalAction, string> = {
	"billing.attach": "Attach",
	"billing.update_subscription": "Update subscription",
	"billing.set_plans": "Set plans",
	"billing.schedule": "Schedule",
	"billing.cancel": "Cancel",
	"billing.uncancel": "Uncancel",
	"invoices.create": "Create invoice",
	"invoices.finalize": "Finalize invoice",
	"invoices.pay": "Pay invoice",
	"invoices.void": "Void invoice",
	"invoices.update": "Update invoice",
	"invoices.reissue": "Reissue invoice",
	"invoices.credit_note": "Create credit note",
	"balances.create": "Grant credits",
	"balances.update": "Set balance",
	"rewards.create": "Create reward",
	"rewards.apply": "Apply reward",
	"customers.create": "Create customer",
	"customers.update": "Update customer",
	"customers.delete": "Delete customer",
	"catalog.edit_plans": "Edit plans",
	"catalog.edit_features": "Edit features",
	"api_keys.create": "Create API key",
	"migrations.create": "Create migration",
	"migrations.run": "Run migration",
	"members.invite": "Invite member",
	"members.change_role": "Change member role",
};

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

const TIMING_LABELS: Record<string, string> = {
	cancel_end_of_cycle: "End of cycle",
	cancel_immediately: "Immediately",
};

const CANCEL_ACTIONS = new Set<ApprovalAction>([
	"billing.cancel",
	"billing.uncancel",
]);

const CUSTOM_CONDITION: RuleCondition = {
	field: "",
	operator: "",
	value: "Custom condition",
};

type ReaderContext = {
	labels: RuleLabels;
	isCancel: boolean;
	filter: ActionFilter;
};

type Format = (params: { value: unknown; ctx: ReaderContext }) => string;

type FieldReader = (params: {
	value: unknown;
	ctx: ReaderContext;
}) => RuleCondition[];

type Readers = Record<string, FieldReader>;

const isFilter = (value: unknown): value is ActionFilter =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const hasNullField = (filter: ActionFilter) =>
	Object.values(filter).some((value) => value === null);

const capitalize = (text: string) =>
	text.charAt(0).toUpperCase() + text.slice(1);

const yesNo: Format = ({ value }) => (value ? "Yes" : "No");
const money: Format = ({ value, ctx }) => ctx.labels.money(Number(value));
const planName: Format = ({ value, ctx }) => ctx.labels.plan(String(value));
const featureName: Format = ({ value, ctx }) =>
	ctx.labels.feature(String(value)).name;
const featureAmount: Format = ({ value, ctx }) =>
	[value, ctx.labels.feature(String(ctx.filter.feature_id)).unit]
		.filter(Boolean)
		.join(" ");
const timing: Format = ({ value }) =>
	TIMING_LABELS[String(value)] ?? String(value);

/** Conditions from a matcher: a bare value means "is", else one condition per operator, so ranges keep both limits. */
const field =
	(label: string, format: Format): FieldReader =>
	({ value, ctx }) => {
		if (!isFilter(value)) {
			return [{ field: label, operator: "is", value: format({ value, ctx }) }];
		}
		return Object.entries(value).map(([operator, operand]) => {
			const operands = Array.isArray(operand) ? operand : [operand];
			return {
				field: label,
				operator: OPERATORS[operator] ?? operator,
				value: operands.map((item) => format({ value: item, ctx })).join(", "),
			};
		});
	};

const filterConditions = ({
	filter,
	readers,
	ctx,
}: {
	filter: ActionFilter;
	readers: Readers;
	ctx: ReaderContext;
}): RuleCondition[] =>
	Object.entries(filter).flatMap(([key, value]) => {
		const nextCtx = { ...ctx, filter };
		if (key === "$or") {
			return cappedConditions({ branches: value, readers, ctx: nextCtx });
		}
		const read = readers[key];
		return read ? read({ value, ctx: nextCtx }) : [CUSTOM_CONDITION];
	});

/** `$or: [{ x: null }, { x: … }]` is a cap that lets "no x" through; the editor shows its widest branch, stored last. */
const cappedConditions = ({
	branches,
	readers,
	ctx,
}: {
	branches: unknown;
	readers: Readers;
	ctx: ReaderContext;
}): RuleCondition[] => {
	if (!Array.isArray(branches)) return [CUSTOM_CONDITION];
	const caps = branches.filter(
		(branch) => isFilter(branch) && !hasNullField(branch),
	);
	const widest = caps.at(-1);
	if (!widest || caps.length === branches.length) return [CUSTOM_CONDITION];
	return filterConditions({ filter: widest, readers, ctx });
};

/** Array filters read the same for `$every` and `$some`; `$none` isn't worded yet. */
const elements =
	(readers: (ctx: ReaderContext) => Readers): FieldReader =>
	({ value, ctx }) => {
		const element = isFilter(value) ? (value.$every ?? value.$some) : null;
		if (!isFilter(element)) return [CUSTOM_CONDITION];
		return filterConditions({ filter: element, readers: readers(ctx), ctx });
	};

const freeTrial: FieldReader = ({ value, ctx }) => {
	if (!isFilter(value)) return [CUSTOM_CONDITION];
	const unit = String(value.duration_type);
	const duration: Format = ({ value: length }) =>
		`${length} ${unit}${Number(length) === 1 ? "" : "s"}`;
	return field("Free trial", duration)({ value: value.duration_length, ctx });
};

const planReaders = (plan: string): Readers => ({
	plan_id: field(plan, planName),
	recurring: field(`${plan} is recurring`, yesNo),
	free_trial: freeTrial,
});

const WHEN_READERS: Readers = {
	paid: field("Charges customer", yesNo),
	checkout: ({ value }) => [
		{
			field: "",
			operator: "",
			value: value ? "Sends a checkout link" : "Doesn't send a checkout link",
		},
	],
	incoming: elements(() => planReaders("Incoming plan")),
	outgoing: elements(({ isCancel }) =>
		planReaders(isCancel ? "Plan" : "Outgoing plan"),
	),
	discounts: elements(() => ({
		percent_off: field("Discount percent off", ({ value }) => `${value}%`),
	})),
	cancel_action: field("Timing", timing),
	refund: ({ value, ctx }) =>
		isFilter(value)
			? field("Refund", money)({ value: value.amount, ctx })
			: [CUSTOM_CONDITION],
	feature_id: field("Feature", featureName),
	included_grant: field("Amount", featureAmount),
};

/** Top-level `$or` branches are the editor's OR groups, unless they're a single capped field. */
const whenGroups = ({
	when,
	ctx,
}: {
	when: ActionFilter;
	ctx: ReaderContext;
}): RuleCondition[][] => {
	const { $or: branches, ...rest } = when;
	const isGroups =
		Array.isArray(branches) &&
		Object.keys(rest).length === 0 &&
		branches.every((branch) => isFilter(branch) && !hasNullField(branch));
	const groups = isGroups ? branches : [when];
	return groups.map((group) =>
		filterConditions({ filter: group, readers: WHEN_READERS, ctx }),
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
	if (subject.type === "role") return capitalize(subject.role);
	return labels.member(subject.user_id);
};

const word = (text: string, key = text): SentencePart => ({
	kind: "word",
	key,
	text,
});

const groupParts = ({
	conditions,
	group,
}: {
	conditions: RuleCondition[];
	group: number;
}): SentencePart[] =>
	conditions.flatMap((condition, i) => [
		...(i > 0 ? [word("and", `and-${group}-${i}`)] : []),
		{
			kind: "condition" as const,
			key: `condition-${group}-${i}`,
			...condition,
		},
	]);

const whenParts = ({
	rule,
	labels,
}: {
	rule: ApprovalRule;
	labels: RuleLabels;
}): SentencePart[] => {
	if (!rule.when || Object.keys(rule.when).length === 0) return [];
	const isCancel = rule.actions.every((action) => CANCEL_ACTIONS.has(action));
	const groups = whenGroups({
		when: rule.when,
		ctx: { labels, isCancel, filter: rule.when },
	});
	return [
		word("when"),
		...groups.flatMap((conditions, group) => [
			...(group > 0 ? [word("or", `or-${group}`)] : []),
			...groupParts({ conditions, group }),
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
			text: ACTION_LABELS[action],
		}),
	),
	...whenParts({ rule, labels }),
];

const partText = (part: SentencePart) =>
	part.kind === "condition"
		? [part.field, part.operator, part.value].filter(Boolean).join(" ")
		: part.text;

export const sentenceText = (parts: SentencePart[]) =>
	parts.map(partText).join(" ");
