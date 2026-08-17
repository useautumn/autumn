import type { CatalogDecisionModel } from "@autumn/render";
import { formatMoney } from "@autumn/render";
import { AppEnv, type CatalogPlanPreview } from "@autumn/shared";
import { Actions, Button, Card, type CardChild, CardText } from "chat";
import { z } from "zod";

const questionButtonPayloadSchema = z.strictObject({
	e: z.nativeEnum(AppEnv),
	g: z.string(),
	l: z.string(),
	o: z.string(),
	q: z.string(),
	r: z.string(),
	s: z.string(),
});

const catalogDecisionButtonPayloadSchema = z.strictObject({
	e: z.nativeEnum(AppEnv),
	g: z.string(),
	l: z.string(),
	m: z.union([z.literal(0), z.literal(1)]),
	p: z.string(),
	pv: z.array(z.string()),
	v: z.string(),
});

type QuestionButtonPayload = z.infer<typeof questionButtonPayloadSchema>;
type CatalogDecisionButtonPayload = z.infer<
	typeof catalogDecisionButtonPayloadSchema
>;

const parsePayload = <T>({
	schema,
	value,
}: {
	schema: z.ZodType<T>;
	value?: string;
}): T | null => {
	if (!value) return null;
	try {
		const parsed = schema.safeParse(JSON.parse(value));
		return parsed.success ? parsed.data : null;
	} catch {
		return null;
	}
};

export const parseQuestionButtonPayload = (value?: string) =>
	parsePayload({ schema: questionButtonPayloadSchema, value });

export const parseCatalogDecisionButtonPayload = (value?: string) =>
	parsePayload({ schema: catalogDecisionButtonPayloadSchema, value });

const PROMPT_PAYLOAD_MAX = 400;
const SLACK_BUTTON_VALUE_MAX = 2000;
const ANSWER_QUESTION_ACTION = "answer_agent_question";
const CATALOG_DECISION_ACTION = "catalog_decision_choice";
const MAX_ACTION_BUTTONS = 10;
const BUTTON_LABEL_MAX = 75;

const indexedActionIds = (action: string) =>
	Array.from(
		{ length: MAX_ACTION_BUTTONS },
		(_, index) => `${action}_${index}`,
	);

export const questionAnswerActionIds = indexedActionIds(ANSWER_QUESTION_ACTION);
export const catalogDecisionActionIds = indexedActionIds(
	CATALOG_DECISION_ACTION,
);

const truncatePrompt = (prompt: string) =>
	prompt.length > PROMPT_PAYLOAD_MAX
		? `${prompt.slice(0, PROMPT_PAYLOAD_MAX)}…`
		: prompt;

const buttonLabel = (label: string) =>
	label.length > BUTTON_LABEL_MAX
		? `${label.slice(0, BUTTON_LABEL_MAX - 1)}…`
		: label;

export const questionCard = ({
	env,
	options,
	orgId,
	prompt,
	requestId,
	sessionId,
}: {
	env: AppEnv;
	options: ReadonlyArray<Readonly<{ id?: string; label?: string }>>;
	orgId: string;
	prompt: string;
	requestId: string;
	sessionId: string;
}) => {
	const buttons = options
		.slice(0, MAX_ACTION_BUTTONS)
		.flatMap((option, index) => {
			const optionId = option.id ?? option.label;
			if (!optionId) return [];
			const payload: QuestionButtonPayload = {
				e: env,
				g: orgId,
				l: option.label ?? optionId,
				o: optionId,
				q: truncatePrompt(prompt),
				r: requestId,
				s: sessionId,
			};
			return [
				Button({
					id: `${ANSWER_QUESTION_ACTION}_${index}`,
					label: buttonLabel(option.label ?? optionId),
					value: JSON.stringify(payload),
				}),
			];
		});
	return Card({
		children: [
			CardText(prompt),
			...(buttons.length ? [Actions(buttons)] : []),
			CardText("You can also just reply in the thread.", { style: "muted" }),
		],
	});
};

export const questionAnsweredCard = ({
	actorId,
	answerLabel,
	prompt,
}: {
	actorId?: string;
	answerLabel: string;
	prompt: string;
}) =>
	Card({
		children: [
			CardText(prompt),
			CardText(
				`Answered: **${answerLabel}**${actorId ? ` by <@${actorId}>` : ""}`,
				{ style: "muted" },
			),
		],
	});

export const catalogDecisionSubmittedCard = ({
	actorId,
	choiceLabel,
	planName,
}: {
	actorId?: string;
	choiceLabel: string;
	planName: string;
}) =>
	Card({
		title: "Catalog change decisions",
		children: [
			CardText(
				`**${planName}**: ${choiceLabel}${actorId ? ` — chosen by <@${actorId}>` : ""}`,
			),
			CardText("Applying the change…", { style: "muted" }),
		],
	});

const priceChangeLine = (plan: CatalogPlanPreview) => {
	const change = plan.price_change;
	if (!change?.previous || !change.current) return null;
	const previous = formatMoney({ amount: change.previous.amount });
	const current = formatMoney({ amount: change.current.amount });
	return `Price: ${previous} → **${current}** per ${change.current.interval}`;
};

const variantLines = (model: CatalogDecisionModel) => {
	if (model.variants.length === 0) return [];
	const lines = model.variants.map((variant) => {
		if (variant.conflictMessages.length > 0) {
			return `• ${variant.name} — skipped (${variant.conflictMessages.join("; ")})`;
		}
		return `• ${variant.name} — will receive this change`;
	});
	return [`**Variants**`, ...lines];
};

export const catalogDecisionCard = ({
	env,
	model,
	orgId,
	plan,
}: {
	env: AppEnv;
	model: CatalogDecisionModel;
	orgId: string;
	plan: CatalogPlanPreview;
}) => {
	const propagateIds = model.variants
		.filter((variant) => variant.defaultSelected)
		.map((variant) => variant.planId);
	const payloadFor = ({
		choice,
		label,
		migrate,
	}: {
		choice: string;
		label: string;
		migrate: boolean;
	}): CatalogDecisionButtonPayload => ({
		e: env,
		g: orgId,
		l: label,
		m: migrate ? 1 : 0,
		p: model.planId,
		pv: propagateIds,
		v: choice,
	});

	const payloadValue = (payload: CatalogDecisionButtonPayload) => {
		const value = JSON.stringify(payload);
		if (value.length <= SLACK_BUTTON_VALUE_MAX) return value;
		return JSON.stringify({ ...payload, pv: [] });
	};

	const buttons = [
		...model.versioningOptions.map((option, index) =>
			Button({
				id: `${CATALOG_DECISION_ACTION}_${index}`,
				label: buttonLabel(option.label),
				style: index === 0 ? ("primary" as const) : undefined,
				value: payloadValue(
					payloadFor({
						choice: option.value,
						label: option.label,
						migrate: false,
					}),
				),
			}),
		),
		...(model.migration.available
			? [
					Button({
						id: `${CATALOG_DECISION_ACTION}_${model.versioningOptions.length}`,
						label: "Update current + migrate customers",
						value: payloadValue(
							payloadFor({
								choice: "update_current",
								label: "Update current + migrate customers",
								migrate: true,
							}),
						),
					}),
				]
			: []),
	];

	const optionLines = model.versioningOptions.map(
		(option) => `• **${option.label}** — ${option.description}`,
	);
	const bodyLines = [
		priceChangeLine(plan),
		plan.item_changes?.length
			? `${plan.item_changes.length} plan item change(s)`
			: null,
	].filter((line): line is string => Boolean(line));

	const children: CardChild[] = [
		CardText(
			`**${model.planName}** needs a decision before this change can apply.`,
		),
		...(bodyLines.length ? [CardText(bodyLines.join("\n"))] : []),
		CardText(optionLines.join("\n")),
		...(variantLines(model).length
			? [CardText(variantLines(model).join("\n"), { style: "muted" })]
			: []),
		...(model.migration.available
			? [
					CardText(`Migration: ${model.migration.description}`, {
						style: "muted",
					}),
				]
			: []),
		Actions(buttons),
	];
	return Card({ title: "Catalog change decisions", children });
};
