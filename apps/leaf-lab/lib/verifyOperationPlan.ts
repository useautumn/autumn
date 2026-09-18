import type { ToolCall } from "./context.js";
import { assertExactRequestedBasePrice } from "./exactRequestedPrice.js";
import { verifyFeatureCoverage } from "./featureCoverage.js";
import { askJev, type JevMeasurement } from "./jev.js";
import {
	buildEffectivePlanEvidence,
	buildPricedAllowanceEquivalenceEvidence,
	buildPricedAllowanceRepairGuidance,
	detectPricedAllowanceRemovals,
} from "./planEconomics.js";
import { assertNoMinorUnitConversion } from "./requestedMoney.js";

export const assertPlanRules = ({
	evidence,
	actions,
}: {
	evidence: unknown;
	actions: ToolCall[];
}) => {
	for (const action of actions) {
		const request = action.args.request as { remove_plan_ids?: string[] };
		if (action.name === "attach" && request.remove_plan_ids?.length)
			throw new Error(
				"This sequential approval workflow requires each additional plan cancellation as an explicit updateSubscription action, with its own scope, preview and approval; do not combine removals through attach.remove_plan_ids.",
			);
	}
	assertNoMinorUnitConversion({
		messages:
			(evidence as { messages?: Array<{ role: string; content: string }> })
				.messages ?? [],
		actions,
	});
	return assertExactRequestedBasePrice({
		messages:
			(evidence as { messages?: Array<{ role: string; content: string }> })
				.messages ?? [],
		actions,
	});
};

export const verifyOperationPlan = async ({
	evidence,
	actions,
	onMeasurement,
	onVerdict,
}: {
	evidence: unknown;
	actions: ToolCall[];
	onMeasurement: (measurement: JevMeasurement) => void;
	onVerdict: (answers: Record<string, number>) => void;
}) => {
	const literalBasePriceCheck = assertPlanRules({ evidence, actions });
	const calendarDates: Array<{ path: string; epochMs: number; utc: string }> =
		[];
	const collectDates = (value: unknown, path: string): void => {
		if (Array.isArray(value)) {
			value.forEach((child, index) => {
				collectDates(child, `${path}[${index}]`);
			});
			return;
		}
		if (!value || typeof value !== "object") return;
		for (const [key, child] of Object.entries(value)) {
			if (key.endsWith("_at") && typeof child === "number") {
				const date = new Date(child);
				if (!Number.isFinite(date.getTime()))
					throw new Error(`Invalid timestamp at ${path}.${key}`);
				calendarDates.push({
					path: `${path}.${key}`,
					epochMs: child,
					utc: date.toISOString(),
				});
			}
			collectDates(child, `${path}.${key}`);
		}
	};
	actions.forEach((action, index) => {
		collectDates(action.args.request, `actions[${index}].request`);
	});
	const { reads: _reads, ...reviewEvidence } = evidence as Record<
		string,
		unknown
	>;
	const completedActions =
		(reviewEvidence.completed as
			| Array<{ call: ToolCall; result: unknown }>
			| undefined) ?? [];
	const pricedAllowanceRemovals = detectPricedAllowanceRemovals({
		evidence,
		actions,
	});
	const pricedAllowanceEquivalence = buildPricedAllowanceEquivalenceEvidence({
		evidence,
		actions,
	});
	const effectivePlans = buildEffectivePlanEvidence({ evidence, actions });
	const ev = evidence as {
		today?: string;
		dateAnchors?: Array<{ date: string; utcMidnightEpochMs: number }>;
	};
	const todayMs = ev.today ? Date.parse(ev.today) : Number.NaN;
	const anchors = new Map(
		(ev.dateAnchors ?? []).map((a) => [a.utcMidnightEpochMs, a.date] as const),
	);
	const scheduleTimingFacts = actions.flatMap((call, actionIndex) => {
		if (call.name !== "createSchedule") return [];
		const phases = (
			(call.args.request as { phases?: Array<{ starts_at?: unknown }> })
				.phases ?? []
		).map((phase, phaseIndex) => {
			const startsAt =
				typeof phase.starts_at === "number" ? phase.starts_at : undefined;
			const utc =
				startsAt === undefined
					? null
					: new Date(startsAt).toISOString().slice(0, 10);
			const source =
				startsAt === undefined
					? "unresolved"
					: anchors.has(startsAt)
						? `user-written date ${anchors.get(startsAt)}`
						: Math.abs(startsAt - todayMs) <= 15 * 60 * 1000
							? "the preparation moment (evidence.today), because the user wrote no service start date"
							: phaseIndex > 0
								? "a duration offset from the previous phase, resolved by the API's own timing helper"
								: "unexplained";
			return { phaseIndex, startsAtUtcDay: utc, derivedFrom: source };
		});
		return [{ actionIndex, phases }];
	});
	const [answers, coverage] = await Promise.all([
		askJev({
			state: {
				evidence: reviewEvidence,
				completedActions,
				remainingActions: actions,
				completeActionSequence: [
					...completedActions.map(({ call }) => ({
						state: "already executed",
						call,
					})),
					...actions.map((call) => ({ state: "not yet executed", call })),
				],
				calendarDates,
				pricedAllowanceRemovals,
				pricedAllowanceEquivalence,
				effectivePlans,
				literalBasePriceCheck,
				scheduleTimingFacts,
				disclosedObligations:
					(evidence as { disclosedObligations?: unknown })
						.disclosedObligations ?? [],
				status:
					"Unexecuted proposed plan; completed actions in evidence have already executed. Billing and customer-update writes require separate explicit approvals; creating explicitly requested missing customer/entity records follows the raw MCP non-destructive provisioning policy.",
			},
			questions: {
				unrequested_target_change:
					"Does a remaining action attach, cancel, or modify a plan or subscription that the user never asked to touch? Judge which subscriptions/plans are affected, not their terms. Use completeActionSequence: remaining actions are the unexecuted rest of one plan the user already authorized. When the user says the new plan should be their ONLY plan, or to cancel everything else / all the others, every observed other subscription for that customer is in scope regardless of which entity holds it; a sentence choosing WHERE to attach the new plan (customer level or a named entity) scopes the attachment only and never narrows that cleanup. Read-only questions never authorize writes.",
				unrequested_billing_mode_change:
					"Does a remaining action change an EXISTING subscription's invoice/collection mode, immediate-access setting, proration or billing anchor when the user did not ask for that change? For a NEW attachment or schedule, operator defaults (invoice mode on, finalize false, immediate access, proration none) are not mutations; answer no unless the user stated a different choice that the action contradicts.",
				unrequested_trial_change:
					"Does a remaining action add, remove or change a free trial on a subscription when the user did not request that? Unstated means no.",
				...(pricedAllowanceRemovals.length
					? {
							pricing_removal_authorized:
								"Did the USER explicitly request removing the particular paid/prepaid pricing slots identified in pricedAllowanceRemovals? Increasing included credits alone is NOT permission to remove their existing pricing. Permission must be explicit, not inferred from the proposed JSON or assistant descriptions.",
						}
					: {}),
				wrong_target:
					"Judge ONLY the actions in remainingActions, one at a time: does any of them name a customer, entity, product family, or plan that differs from what the user asked for, given the conversation and authoritative facts? Do not judge actions in completedActions; they already executed and their subscriptions will be absent from current reads, which is expected. A remaining cancellation of an observed subscription on any entity is a correct target when the user asked for the new plan to be their only plan or to cancel everything else; the attachment's chosen entity does not narrow that. When the user names a product family (for example their marketing product) that differs from an existing subscription's family, a NEW attachment of a plan in the named family is correct and modifying the unrelated existing subscription is wrong. Within the named family, the catalog plan whose base allowance is closest to, but not above, the requested allowance, customized up, is correct. Similar plan names are not interchangeable; preserve requested Marketing versus transactional products. A request targeting several customers may have several valid targets.",
				unrequested_base_price:
					"Does a remaining action set customize.price (a custom base price) for a plan when the user did NOT state any price for that plan or phase? Attaching a named catalog plan keeps its catalog price unless the user requests a change; an allowance-only or feature-only request does not authorize a base-price override. If the user or their document states a price for that plan or phase, answer no here (amount correctness is judged by missing_base_price). Do not treat assistant summaries or unrelated catalog prices as user instructions.",
				missing_action:
					"Inspect completeActionSequence, which includes ALREADY EXECUTED actions plus remaining actions. Does the user explicitly request a distinct billing, catalog-plan, or customer-record ACTION (a plan creation, attachment, cancellation, customer update, record creation, or schedule) that appears nowhere in that sequence? Judge actions only, not the terms inside an action. Completed work is fulfilled. A single createSchedule covers every phase it lists.",
				missing_phase_or_date:
					"Use scheduleTimingFacts, which states for every phase the UTC day it starts and how that day was derived. Is a user-stated phase absent from the schedule, or does a phase whose derivedFrom is a user-written date differ from the date the user actually wrote for that phase? A phase derived from the preparation moment or from a duration offset is correct by construction when the user wrote no calendar date for it; answer no for those. Signature dates, effective-date lines and term lengths are not phase start dates. Judge only phase count and explicitly written dates.",
				missing_base_price:
					"Does any remaining action contradict a base price the user explicitly stated for that action or phase (amount or billing interval)? Judge base price only; unstated prices may use the catalog. Feature prices are judged elsewhere.",
				missing_net_terms:
					"Does the user explicitly state Net payment terms (for example Net 30) that a remaining invoice-mode action omits or contradicts? Unstated means no.",
				missing_trial:
					"Does the user explicitly request a free trial that a remaining action omits, or does an action add a trial the user did not request? Unstated means no.",
				missing_cancel_timing:
					"Does a remaining cancellation's cancel_action contradict the timing the user explicitly requested (immediate versus end of cycle), or does the user request an explicit end date that an attach action can represent via ends_at but omits? A remaining action that carries the user's stated cancel_action is correct; earlier cancellations in completeActionSequence that already executed are fulfilled, not missing. createSchedule has no end date, end behavior or cancellation field, so an end-of-term or non-renewal obligation is not representable there and must be answered no. Anything in disclosedObligations is a documented manual follow-up, not missing.",
				missing_invoice_or_proration:
					"Does the user explicitly state invoice finalization or proration/billing_behavior that a remaining action contradicts? Unstated means no; catalog and operator defaults are acceptable.",
				wrong_scope:
					"Does a remaining action target the wrong billing scope? New plan attachments follow the user's chosen customer/entity scope, which may override an org default. Cancellation/update of an EXISTING subscription must retain THAT subscription's existing scope, even when a NEW plan is attached at a different scope. A request to cancel everything includes old subscriptions across customer and entity scopes; customer-level placement of the new plan does not relocate old subscriptions. Do not require new entities for existing customer-level subscriptions.",
				unrequested_creation:
					"Does getOrCreateCustomer or createEntity create a record without explicit user intent to create that missing record and enough user-provided identity details? Merely failing to find an existing customer is not permission to create one. No creation actions means false.",
				violates_notes:
					"Does this plan contradict an explicit written organization policy in the supplied getAgentRules notes? Empty or absent notes imply no violation. Do not invent policies or treat preview/approval as omitted operations; the executor performs them separately.",
			},
			onMeasurement,
		}),
		verifyFeatureCoverage({ evidence, effectivePlans, onMeasurement }),
	]);
	onVerdict({ ...answers, ...coverage.answers });
	if (
		pricedAllowanceRemovals.length &&
		(answers.pricing_removal_authorized ?? 0) < 0.9
	)
		throw new Error(
			`Allowance replacement removes paid pricing without explicit user authorization. Preserve the existing paid pricing. Suggested source-backed corrections: ${JSON.stringify(buildPricedAllowanceRepairGuidance({ losses: pricedAllowanceRemovals }))}`,
		);
	const userText = (
		(evidence as { messages?: Array<{ role: string; content: string }> })
			.messages ?? []
	)
		.filter((message) => message.role === "user")
		.map((message) => message.content)
		.join("\n");
	const cancelWordMatches = (action: ToolCall) => {
		const cancel = (action.args.request as { cancel_action?: string })
			.cancel_action;
		if (cancel === "cancel_immediately")
			return /\bimmediately\b/i.test(userText);
		if (cancel === "cancel_end_of_cycle")
			return /\bend of (the )?(billing )?(cycle|period|term)\b/i.test(userText);
		return false;
	};
	const deterministicallySettled = new Set<string>([
		...(literalBasePriceCheck.status === "checked"
			? ["unrequested_base_price"]
			: []),
		...(actions.some(
			(action) => "cancel_action" in (action.args.request as object),
		) &&
		actions
			.filter((action) => "cancel_action" in (action.args.request as object))
			.every(cancelWordMatches)
			? ["missing_cancel_timing"]
			: []),
	]);
	const failures = [
		...Object.entries(answers)
			.filter(
				([name, probability]) =>
					name !== "pricing_removal_authorized" &&
					!deterministicallySettled.has(name) &&
					probability >= 0.5,
			)
			.map(([name]) => name),
		...coverage.failures,
	];
	if (failures.length)
		throw new Error(`Plan requires correction: ${failures.join(", ")}`);
	return { ...answers, ...coverage.answers };
};
