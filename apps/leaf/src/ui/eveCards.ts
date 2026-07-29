import type { CatalogDecisionModel } from "@autumn/render";
import { formatMoney } from "@autumn/render";
import type { AppEnv, CatalogPlanPreview } from "@autumn/shared";
import { Actions, Button, Card, type CardChild, CardText } from "chat";

/** Compact JSON payloads carried in Slack button values (2000-char cap). */
export type QuestionButtonPayload = {
	/** AppEnv */
	e: string;
	/** orgId */
	g: string;
	/** option label, for the answered-card record */
	l: string;
	/** optionId */
	o: string;
	/** prompt (truncated), for the answered-card record */
	q: string;
	/** requestId */
	r: string;
	/** eve sessionId */
	s: string;
};

export type CatalogDecisionButtonPayload = {
	/** AppEnv */
	e: string;
	/** orgId */
	g: string;
	/** choice label, for the submitted-card record */
	l: string;
	/** migrationDraft */
	m: 0 | 1;
	/** planId */
	p: string;
	/** propagate variant ids */
	pv: string[];
	/** versioning choice */
	v: string;
};

const PROMPT_PAYLOAD_MAX = 400;
const SLACK_BUTTON_VALUE_MAX = 2000;

const truncatePrompt = (prompt: string) =>
	prompt.length > PROMPT_PAYLOAD_MAX
		? `${prompt.slice(0, PROMPT_PAYLOAD_MAX)}…`
		: prompt;

export const ANSWER_QUESTION_ACTION = "answer_agent_question";
export const CATALOG_DECISION_ACTION = "catalog_decision_choice";

// Slack requires unique action_ids within a block, so each button gets an
// indexed id; handlers register the full indexed set.
export const MAX_ACTION_BUTTONS = 10;
export const indexedActionIds = (action: string) =>
	Array.from(
		{ length: MAX_ACTION_BUTTONS },
		(_, index) => `${action}_${index}`,
	);

const BUTTON_LABEL_MAX = 75;
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
	options: { id?: string; label?: string }[];
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

/** The question card after someone answered — buttons collapse to a record. */
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

/** The decision card after someone chose — buttons collapse to a record. */
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

/** Versioning / variant / migration decisions as one-click buttons. The
 * defaults (conflict-free variant propagation, no migration) ride in each
 * button's payload; refinements can be typed in the thread instead. */
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

	// Slack rejects button values over the cap outright, which would leave the
	// click dead; shedding the propagate list degrades to a model re-confirm.
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
