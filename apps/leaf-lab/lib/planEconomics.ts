import { isDeepStrictEqual } from "node:util";
import {
	applyCustomizeToPlan,
	CreatePlanItemParamsV1Schema,
	loosePlanItemMatchesFilter,
	TierBehavior,
	toCreatePlanItemParams,
} from "@autumn/shared";
import {
	PlanItemParamsObjectSchema,
	PlanItemPriceParamsSchema,
} from "../../../shared/api/products/items/crud/createPlanItemParamsV1.js";
import {
	addIncludedToTiers,
	subtractIncludedFromTiers,
} from "../../../shared/utils/productV2Utils/productItemUtils/tierUtils.js";
import type { ToolCall } from "./context.js";

type Item = Record<string, unknown>;
export type PricedAllowanceRemoval = {
	actionIndex: number;
	phaseIndex?: number;
	planId: string;
	featureId: string;
	billingMethod: string;
	sourceItem: Item;
	replacementItems: Item[];
};

export type PricedAllowanceRepairGuidance = Pick<
	PricedAllowanceRemoval,
	"actionIndex" | "phaseIndex" | "planId" | "featureId" | "billingMethod"
> & {
	status: "repair" | "clarify";
	message: string;
	replacementItem?: Item;
};

const businessItemSchema = PlanItemParamsObjectSchema.omit({
	entity_feature_id: true,
	entitlement_id: true,
	price_id: true,
}).extend({
	price: PlanItemPriceParamsSchema.omit({ stripe_price_id: true }).optional(),
});

const retainSuppliedFields = ({
	parsed,
	supplied,
}: {
	parsed: unknown;
	supplied: unknown;
}): unknown => {
	if (Array.isArray(parsed))
		return parsed.map((value, index) =>
			retainSuppliedFields({
				parsed: value,
				supplied: Array.isArray(supplied) ? supplied[index] : undefined,
			}),
		);
	if (!parsed || typeof parsed !== "object") return parsed;
	return Object.fromEntries(
		Object.entries(parsed)
			.filter(
				([key]) =>
					Object.hasOwn(record(supplied), key) &&
					record(supplied)[key] !== undefined,
			)
			.map(([key, value]) => [
				key,
				retainSuppliedFields({
					parsed: value,
					supplied: record(supplied)[key],
				}),
			]),
	);
};

const suppliedTermsMatch = ({
	supplied,
	source,
}: {
	supplied: unknown;
	source: unknown;
}): boolean => {
	if (!supplied || typeof supplied !== "object") return supplied === source;
	return Object.entries(supplied).every(([key, value]) =>
		suppliedTermsMatch({ supplied: value, source: record(source)[key] }),
	);
};

export const buildPricedAllowanceRepairGuidance = ({
	losses,
}: {
	losses: PricedAllowanceRemoval[];
}): PricedAllowanceRepairGuidance[] =>
	losses.map((loss) => {
		const identity = {
			actionIndex: loss.actionIndex,
			...(loss.phaseIndex !== undefined ? { phaseIndex: loss.phaseIndex } : {}),
			planId: loss.planId,
			featureId: loss.featureId,
			billingMethod: loss.billingMethod,
		};
		const clarify = (message: string): PricedAllowanceRepairGuidance => ({
			...identity,
			status: "clarify",
			message,
		});
		const replacement = loss.replacementItems[0];
		const source = loss.sourceItem;
		if (
			loss.replacementItems.length !== 1 ||
			losses.filter(
				(other) =>
					other.actionIndex === loss.actionIndex &&
					other.phaseIndex === loss.phaseIndex &&
					other.planId === loss.planId &&
					other.featureId === loss.featureId,
			).length !== 1
		)
			return clarify(
				"Clarify which priced allowance each replacement should preserve; there is not a unique source-to-replacement mapping.",
			);
		if (
			source.feature_id !== loss.featureId ||
			replacement.feature_id !== loss.featureId ||
			record(source.price).billing_method !== loss.billingMethod ||
			source.unlimited === true ||
			replacement.unlimited === true ||
			typeof source.included !== "number" ||
			!Number.isFinite(source.included) ||
			source.included < 0 ||
			typeof replacement.included !== "number" ||
			!Number.isFinite(replacement.included) ||
			replacement.included < 0
		)
			return clarify(
				"Clarify the source and requested finite included allowances before preserving paid pricing.",
			);
		for (const key of [
			"reset",
			"rollover",
			"expiry",
			"proration",
			"unlimited",
			"pooled",
			"feature_override",
			"threshold_billing",
		]) {
			if (replacement[key] === undefined) continue;
			const sourceValue =
				source[key] ??
				(["unlimited", "pooled"].includes(key) ? false : undefined);
			if (
				!suppliedTermsMatch({ supplied: replacement[key], source: sourceValue })
			)
				return clarify(
					`Clarify the requested ${key} change as well as the allowance; an allowance-only repair would discard that change.`,
				);
		}
		const candidate = structuredClone(
			toCreatePlanItemParams(
				source as Parameters<typeof toCreatePlanItemParams>[0],
			),
		);
		candidate.included = replacement.included;
		for (const key of ["expiry", "threshold_billing"] as const)
			if (source[key] != null)
				Object.assign(candidate, { [key]: structuredClone(source[key]) });
		if (candidate.price?.tiers) {
			const internal = subtractIncludedFromTiers({
				tiers: candidate.price.tiers,
				included: source.included,
			});
			if (internal.some((tier) => typeof tier.to === "number" && tier.to <= 0))
				return clarify(
					"Clarify invalid source tier boundaries before changing the included allowance.",
				);
			candidate.price.tiers = addIncludedToTiers({
				tiers: internal,
				included: replacement.included,
			});
		}
		const parsed = businessItemSchema.safeParse(candidate);
		if (!parsed.success)
			return clarify(
				"The source item cannot be represented as a supported business-only plan item; inspect its pricing before repair.",
			);
		const replacementItem = record(
			retainSuppliedFields({ parsed: parsed.data, supplied: candidate }),
		);
		if (!CreatePlanItemParamsV1Schema.safeParse(replacementItem).success)
			return clarify(
				"The repaired allowance and pricing do not satisfy the real plan-item schema; clarify the terms.",
			);
		return {
			...identity,
			status: "repair",
			message:
				"Propose this allowance-only replacement with the existing paid terms preserved. Tier boundaries are rebased through the old and new included allowances. Return a corrected request for normal validation, preview, and approval; this guidance has not applied any change.",
			replacementItem,
		};
	});

const record = (value: unknown): Item =>
	value && typeof value === "object" && !Array.isArray(value)
		? (value as Item)
		: {};
const records = (value: unknown): Item[] =>
	Array.isArray(value) ? value.map(record) : [];
const uniquePlan = (plans: Item[]): Item | undefined => {
	const unique = new Map(plans.map((plan) => [JSON.stringify(plan), plan]));
	return unique.size === 1 ? unique.values().next().value : undefined;
};

const sourcePlan = ({
	evidence,
	call,
	request,
}: {
	evidence: Item;
	call: ToolCall;
	request: Item;
}): Item | undefined => {
	const details = records(evidence.details);
	if (call.name !== "updateSubscription") {
		const matches = (plan: Item) =>
			plan.id === request.plan_id &&
			(request.version === undefined || plan.version === request.version) &&
			Array.isArray(plan.items);
		const fetched = details
			.filter((entry) => entry.name === "getPlan")
			.map((entry) => record(entry.result))
			.filter(matches);
		return fetched.length
			? uniquePlan(fetched)
			: uniquePlan(
					records(record(record(evidence.facts).listPlans).list).filter(
						matches,
					),
				);
	}
	const entityScoped = typeof request.entity_id === "string";
	const owners = details.filter((entry) => {
		if (entry.name !== (entityScoped ? "getEntity" : "getCustomer"))
			return false;
		const args = record(record(entry.args).request);
		const result = record(entry.result);
		if (
			args.customer_id !== undefined &&
			args.customer_id !== request.customer_id
		)
			return false;
		if (!entityScoped) return result.id === request.customer_id;
		return (
			result.id === request.entity_id &&
			(args.customer_id === request.customer_id ||
				result.customer_id === request.customer_id) &&
			(result.customer_id === undefined ||
				result.customer_id === request.customer_id) &&
			(args.entity_id === undefined || args.entity_id === request.entity_id)
		);
	});
	const subscriptions = owners
		.flatMap((entry) => records(record(entry.result).subscriptions))
		.filter(
			(subscription) =>
				(request.subscription_id === undefined ||
					subscription.id === request.subscription_id) &&
				(request.plan_id === undefined ||
					subscription.plan_id === request.plan_id) &&
				(subscription.status === undefined ||
					subscription.status === "active") &&
				(subscription.scope === undefined ||
					subscription.scope === (entityScoped ? "entity" : "customer")),
		);
	const unique = new Map(
		subscriptions.map((subscription) => [
			JSON.stringify(subscription),
			subscription,
		]),
	);
	if (unique.size !== 1) return undefined;
	const subscription = unique.values().next().value;
	const plan = record(subscription?.plan);
	if (plan.id !== subscription?.plan_id || !Array.isArray(plan.items))
		return undefined;
	if (request.version !== undefined && request.version !== plan.version)
		return undefined;
	return plan;
};

export const buildEffectivePlanEvidence = ({
	evidence,
	actions,
}: {
	evidence: unknown;
	actions: ToolCall[];
}) =>
	actions.flatMap((call, actionIndex) => {
		if (!["attach", "updateSubscription", "createSchedule"].includes(call.name))
			return [];
		const request = record(call.args.request);
		if (request.cancel_action && request.cancel_action !== "uncancel")
			return [];
		const targets: Array<{ request: Item; phaseIndex?: number }> =
			call.name === "createSchedule"
				? [
						...records(request.phases).flatMap((phase, phaseIndex) =>
							records(phase.plans).map((request) => ({ request, phaseIndex })),
						),
						...records(request.unscheduled_plans).map((request) => ({
							request,
						})),
					]
				: [{ request }];
		return targets.map(({ request: target, phaseIndex }) => {
			const plan = sourcePlan({
				evidence: record(evidence),
				call,
				request: target,
			});
			const identity = {
				actionIndex,
				...(phaseIndex === undefined ? {} : { phaseIndex }),
				planId: target.plan_id,
			};
			if (!plan) return { ...identity, sourceKnown: false };
			const effective = applyCustomizeToPlan({
				plan: plan as Parameters<typeof applyCustomizeToPlan>[0]["plan"],
				customize: record(target.customize) as Parameters<
					typeof applyCustomizeToPlan
				>[0]["customize"],
			});
			return {
				...identity,
				sourceKnown: true,
				addOn: plan.add_on === true,
				price: structuredClone(effective.price),
				items: structuredClone(
					effective.items.map((item) => toCreatePlanItemParams(item)),
				),
			};
		});
	});

export const detectPricedAllowanceRemovals = ({
	evidence,
	actions,
}: {
	evidence: unknown;
	actions: ToolCall[];
}): PricedAllowanceRemoval[] => {
	const losses: PricedAllowanceRemoval[] = [];
	for (const [actionIndex, call] of actions.entries()) {
		if (!["attach", "updateSubscription", "createSchedule"].includes(call.name))
			continue;
		const request = record(call.args.request);
		if (request.cancel_action && request.cancel_action !== "uncancel") continue;
		const targets: Array<{ request: Item; phaseIndex?: number }> =
			call.name === "createSchedule"
				? [
						...records(request.phases).flatMap((phase, phaseIndex) =>
							records(phase.plans).map((request) => ({ request, phaseIndex })),
						),
						...records(request.unscheduled_plans).map((request) => ({
							request,
						})),
					]
				: [{ request }];
		for (const { request: target, phaseIndex } of targets) {
			const customize = record(target.customize);
			const additions = records(customize.items ?? customize.add_items);
			if (!additions.length) continue;
			const plan = sourcePlan({
				evidence: record(evidence),
				call,
				request: target,
			});
			if (!plan || typeof plan.id !== "string") continue;
			const applied = applyCustomizeToPlan({
				plan: plan as Parameters<typeof applyCustomizeToPlan>[0]["plan"],
				customize: customize as Parameters<
					typeof applyCustomizeToPlan
				>[0]["customize"],
			});
			for (const sourceItem of records(plan.items)) {
				const price = record(sourceItem.price);
				if (
					typeof price.billing_method !== "string" ||
					typeof sourceItem.feature_id !== "string"
				)
					continue;
				if (
					customize.items === undefined &&
					!records(customize.remove_items).some((filter) =>
						loosePlanItemMatchesFilter({ item: sourceItem, filter }),
					)
				)
					continue;
				const replacementItems = additions.filter((item) =>
					loosePlanItemMatchesFilter({
						item,
						filter: { feature_id: sourceItem.feature_id },
					}),
				);
				if (
					!replacementItems.some(
						(item) =>
							typeof item.included === "number" || item.unlimited === true,
					)
				)
					continue;
				if (
					replacementItems.some(
						(item) => item.price !== null && typeof item.price === "object",
					)
				)
					continue;
				const slot = {
					feature_id: sourceItem.feature_id,
					billing_method: price.billing_method,
					interval: price.interval ?? record(sourceItem.reset).interval,
					interval_count:
						price.interval_count ??
						record(sourceItem.reset).interval_count ??
						1,
				};
				const beforeCount = records(plan.items).filter((item) =>
					loosePlanItemMatchesFilter({ item, filter: slot }),
				).length;
				const afterCount = applied.items.filter((item) =>
					loosePlanItemMatchesFilter({ item, filter: slot }),
				).length;
				if (afterCount >= beforeCount) continue;
				losses.push(
					structuredClone({
						actionIndex,
						...(phaseIndex !== undefined ? { phaseIndex } : {}),
						planId: plan.id,
						featureId: sourceItem.feature_id,
						billingMethod: price.billing_method,
						sourceItem,
						replacementItems,
					}),
				);
			}
		}
	}
	return losses;
};

export type PricedAllowanceEquivalenceEvidence = {
	actionIndex: number;
	phaseIndex?: number;
	planId: string;
	featureId: string;
	sourceIncluded: number;
	proposedIncluded: number;
	sourcePaidPrice: Item;
	proposedPaidPrice: Item;
	paidPricePreserved: boolean;
};

const paidCoordinatePrice = (item: Item): Item | undefined => {
	if (
		typeof item.included !== "number" ||
		!Number.isFinite(item.included) ||
		item.included < 0 ||
		item.unlimited === true
	)
		return undefined;
	const input = toCreatePlanItemParams(
		item as Parameters<typeof toCreatePlanItemParams>[0],
	);
	const result = businessItemSchema.safeParse(input);
	if (
		!result.success ||
		!result.data.price ||
		!CreatePlanItemParamsV1Schema.safeParse(result.data).success
	)
		return undefined;
	const price = structuredClone(result.data.price);
	if (price.tiers?.length) {
		price.tiers = subtractIncludedFromTiers({
			tiers: price.tiers,
			included: item.included,
		});
		if (price.tiers.some((tier) => typeof tier.to === "number" && tier.to <= 0))
			return undefined;
		price.tier_behavior ??= TierBehavior.Graduated;
	}
	return {
		...price,
		interval_count: price.interval_count ?? 1,
		billing_units: price.billing_units ?? 1,
		max_purchase: price.max_purchase ?? null,
	};
};

export const buildPricedAllowanceEquivalenceEvidence = ({
	evidence,
	actions,
}: {
	evidence: unknown;
	actions: ToolCall[];
}): PricedAllowanceEquivalenceEvidence[] => {
	const comparisons: PricedAllowanceEquivalenceEvidence[] = [];
	for (const [actionIndex, call] of actions.entries()) {
		if (!["attach", "updateSubscription", "createSchedule"].includes(call.name))
			continue;
		const request = record(call.args.request);
		if (request.cancel_action && request.cancel_action !== "uncancel") continue;
		const targets: Array<{ request: Item; phaseIndex?: number }> =
			call.name === "createSchedule"
				? [
						...records(request.phases).flatMap((phase, phaseIndex) =>
							records(phase.plans).map((request) => ({ request, phaseIndex })),
						),
						...records(request.unscheduled_plans).map((request) => ({
							request,
						})),
					]
				: [{ request }];
		for (const { request: target, phaseIndex } of targets) {
			const customize = record(target.customize);
			const plan = sourcePlan({
				evidence: record(evidence),
				call,
				request: target,
			});
			if (!plan || typeof plan.id !== "string") continue;
			const additions = records(customize.items ?? customize.add_items);
			const removed = records(plan.items).filter(
				(item) =>
					record(item.price).billing_method &&
					(customize.items !== undefined ||
						records(customize.remove_items).some((filter) =>
							loosePlanItemMatchesFilter({ item, filter }),
						)),
			);
			if (!additions.length || !removed.length) continue;
			const applied = applyCustomizeToPlan({
				plan: plan as Parameters<typeof applyCustomizeToPlan>[0]["plan"],
				customize: customize as Parameters<
					typeof applyCustomizeToPlan
				>[0]["customize"],
			});
			for (const source of removed) {
				if (typeof source.feature_id !== "string") continue;
				const filter = { feature_id: source.feature_id };
				if (
					removed.filter((item) => loosePlanItemMatchesFilter({ item, filter }))
						.length !== 1
				)
					continue;
				const replacements = additions.filter((item) =>
					loosePlanItemMatchesFilter({ item, filter }),
				);
				if (replacements.length !== 1) continue;
				const replacement = replacements[0];
				if (
					typeof replacement.included !== "number" ||
					replacement.included === source.included ||
					!record(replacement.price).billing_method
				)
					continue;
				const price = record(replacement.price);
				const effective = applied.items.filter((item) =>
					loosePlanItemMatchesFilter({
						item,
						filter: {
							...filter,
							included: replacement.included,
							billing_method: price.billing_method,
							interval: price.interval,
							interval_count: price.interval_count ?? 1,
						},
					}),
				);
				if (effective.length !== 1) continue;
				const sourcePaidPrice = paidCoordinatePrice(source);
				const proposedPaidPrice = paidCoordinatePrice(
					effective[0] as unknown as Item,
				);
				if (!sourcePaidPrice || !proposedPaidPrice) continue;
				comparisons.push(
					structuredClone({
						actionIndex,
						...(phaseIndex !== undefined ? { phaseIndex } : {}),
						planId: plan.id,
						featureId: source.feature_id,
						sourceIncluded: source.included as number,
						proposedIncluded: replacement.included,
						sourcePaidPrice,
						proposedPaidPrice,
						paidPricePreserved: isDeepStrictEqual(
							sourcePaidPrice,
							proposedPaidPrice,
						),
					}),
				);
			}
		}
	}
	return comparisons;
};
