import type {
	CustomerFilter,
	MigrationFilter,
	PlanFilter,
	StringMatcher,
} from "@autumn/shared";
import { Button } from "@autumn/ui";
import { FunnelSimpleIcon } from "@phosphor-icons/react";
import { useMemo, useRef, useState } from "react";
import { ActionCard } from "../shared/ActionCard";
import { AddButton } from "../shared/AddButton";
import { FilterGroup } from "./FilterGroup";
import {
	customerIdToStrings,
	type FilterField,
	type FilterGroupData,
	type FilterOperator,
	type FilterRule,
	planFilterToGroups,
	planKeysToFilter,
	stringsToCustomerId,
} from "./filterRowTypes";

const DEFAULT_PLAN_FILTER: PlanFilter = { plan_id: "" };

const hasStringValue = (rule: FilterRule) =>
	rule.values.some((value) => value.trim().length > 0);

function inferCustomerIdOperator(
	matcher: StringMatcher | undefined,
	count: number,
): FilterOperator {
	if (matcher && typeof matcher === "object") {
		if ("$nin" in matcher) return "not_in";
		if ("$ne" in matcher) return "is_not";
		if ("$in" in matcher) return "in";
	}
	return count > 1 ? "in" : "is";
}

/** `customer.plan` is `{ $none: {} }` — "has no active plans at all". */
function planRawIsNone(plan: unknown): boolean {
	const inner = planNoneInner(plan);
	return inner !== null && Object.keys(inner).length === 0;
}

/**
 * Inner filter of a `{ $none: ... }` plan quantifier, or null if `plan` isn't
 * a `$none`. An empty inner means "has no plans"; a non-empty inner (e.g.
 * `{ plan_id: { $in: [...] } }`) is the empty-inclusive "not on plan X".
 */
function planNoneInner(plan: unknown): PlanFilter | null {
	if (plan && typeof plan === "object" && "$none" in plan) {
		const inner = (plan as { $none?: unknown }).$none;
		if (inner == null) return {};
		if (typeof inner === "object") return inner as PlanFilter;
	}
	return null;
}

// Fields whose negation is a customer-level `$none` quantifier ("no plan that
// is X"), not a per-plan matcher; otherwise multi-plan customers can leak in.
const NEGATABLE_FIELDS = new Set<FilterField>(["plan_id"]);

const PLAN_PROPERTY_FIELDS = new Set<FilterField>([
	"custom",
	"paid",
	"recurring",
	"price",
]);

function isNegatedRule(rule: FilterRule): boolean {
	return (
		NEGATABLE_FIELDS.has(rule.field) &&
		(rule.operator === "is_not" || rule.operator === "not_in") &&
		rule.values.length > 0
	);
}

/** `is_not`/`not_in` → `is`/`in`, so the rule builds a positive `$none` inner. */
function flipNegatedToPositive(rule: FilterRule): FilterRule {
	if (!NEGATABLE_FIELDS.has(rule.field)) return rule;
	if (rule.operator === "not_in")
		return { ...rule, operator: "in" as FilterOperator };
	if (rule.operator === "is_not")
		return { ...rule, operator: "is" as FilterOperator };
	return rule;
}

/** Inverse of the above: decode a `$none` inner back to the negated operator. */
function negateRules(rules: FilterRule[]): FilterRule[] {
	return rules.map((r) => {
		if (!NEGATABLE_FIELDS.has(r.field)) return r;
		if (r.operator === "in")
			return { ...r, operator: "not_in" as FilterOperator };
		if (r.operator === "is")
			return { ...r, operator: "is_not" as FilterOperator };
		return r;
	});
}

function negateGroups(groups: FilterGroupData[]): FilterGroupData[] {
	return groups.map((g) => ({ rules: negateRules(g.rules) }));
}

// SAVE — one row becomes one customer-level quantifier (a CustomerFilter with
// a single `plan` nav). Independent rows AND together at the customer level, so
// "has free AND has pro" is two quantifiers, not one plan that is both.
function planIdQuantifier(rule: FilterRule): CustomerFilter | null {
	if (rule.operator === "none") return { plan: { $none: {} } };
	if (!hasStringValue(rule)) return null;
	const positive = isNegatedRule(rule) ? flipNegatedToPositive(rule) : rule;
	const planFilter = planKeysToFilter(positive.values);
	return isNegatedRule(rule)
		? { plan: { $none: planFilter } }
		: { plan: planFilter };
}

function ruleToPlanProperty(rule: FilterRule): PlanFilter | null {
	switch (rule.field) {
		case "custom":
			return { custom: rule.values[0] === "true" };
		case "paid":
			return { paid: rule.values[0] === "true" };
		case "recurring":
			return { recurring: rule.values[0] === "true" };
		case "price":
			return {
				price: rule.operator === "exists" ? { $ne: null } : null,
			};
		default:
			return null;
	}
}

function isPositivePlanRule(rule: FilterRule): boolean {
	return (
		rule.field === "plan_id" &&
		rule.operator !== "none" &&
		!isNegatedRule(rule) &&
		hasStringValue(rule)
	);
}

function mergePlanProperties(rules: FilterRule[]): PlanFilter | null {
	let planFilter: PlanFilter | null = null;
	for (const rule of rules) {
		if (!PLAN_PROPERTY_FIELDS.has(rule.field)) continue;
		const propertyFilter = ruleToPlanProperty(rule);
		if (propertyFilter)
			planFilter = { ...(planFilter ?? {}), ...propertyFilter };
	}
	return planFilter;
}

// DECODE — reverse a single `plan` quantifier back into its UI row(s).
function planQuantifierToRules(plan: unknown): FilterRule[] {
	if (planRawIsNone(plan))
		return [{ field: "plan_id", operator: "none", values: [] }];
	const noneInner = planNoneInner(plan);
	if (noneInner)
		return negateRules(planFilterToGroups(noneInner).flatMap((g) => g.rules));
	return planFilterToGroups(plan as PlanFilter).flatMap((g) => g.rules);
}

function branchToRules(branch: CustomerFilter): FilterRule[] {
	const rules: FilterRule[] = [];
	if (branch.$and)
		for (const sub of branch.$and) rules.push(...branchToRules(sub));
	if (branch.plan) rules.push(...planQuantifierToRules(branch.plan));
	return rules;
}

function customerIdRuleFromValue(value: MigrationFilter): FilterRule | null {
	const matcher = value.customer?.customer_id as StringMatcher | undefined;
	const ids = customerIdToStrings(matcher);
	if (ids.length === 0) return null;
	return {
		field: "customer_id",
		operator: inferCustomerIdOperator(matcher, ids.length),
		values: ids,
	};
}

function prependCustomerId(
	groups: FilterGroupData[],
	customerIdRule: FilterRule | null,
): FilterGroupData[] {
	if (!customerIdRule) return groups;
	const [first, ...rest] = groups;
	return [{ rules: [customerIdRule, ...(first?.rules ?? [])] }, ...rest];
}

export function buildGroups(value: MigrationFilter): FilterGroupData[] {
	const customerIdRule = customerIdRuleFromValue(value);
	const customer = value.customer;

	// Customer-level `$or` → one OR-group per branch.
	if (customer?.$or) {
		const groups = customer.$or.map((branch) => ({
			rules: branchToRules(branch),
		}));
		return prependCustomerId(groups, customerIdRule);
	}
	// Customer-level `$and` → one group, a row per branch.
	if (customer?.$and)
		return prependCustomerId(
			[{ rules: branchToRules(customer) }],
			customerIdRule,
		);

	// Single quantifier / legacy merged plan filter — decode `customer.plan`.
	const plan = customer?.plan;

	// "has no plans at all" → single `none` rule.
	if (planRawIsNone(plan)) {
		const noneRule: FilterRule = {
			field: "plan_id",
			operator: "none",
			values: [],
		};
		const rules = customerIdRule ? [customerIdRule, noneRule] : [noneRule];
		return [{ rules }];
	}

	// `{ $none: <inner> }` is the empty-inclusive "not on plan X" / "no feature
	// X" — decode the inner filter and flip its negatable rules back.
	const noneInner = planNoneInner(plan);
	if (noneInner) {
		const groups = negateGroups(planFilterToGroups(noneInner));
		return prependCustomerId(groups, customerIdRule);
	}

	const planFilter = (plan as PlanFilter) ?? DEFAULT_PLAN_FILTER;
	return prependCustomerId(planFilterToGroups(planFilter), customerIdRule);
}

function ruleToCustomerIdMatcher(rule: FilterRule): StringMatcher | undefined {
	if (rule.values.length === 0) return undefined;
	switch (rule.operator) {
		case "is":
			return rule.values[0];
		case "is_not":
			return { $ne: rule.values[0] };
		case "in":
			return { $in: rule.values };
		case "not_in":
			return { $nin: rule.values };
		default:
			return stringsToCustomerId(rule.values);
	}
}

/**
 * One group → its customer-level node: the lone quantifier when a single row
 * carries a condition, otherwise `{ $and: [...] }` over each row's quantifier.
 * `customer_id` rows are hoisted out (they constrain the customer, not a plan).
 */
function groupToNode(group: FilterGroupData): {
	customerId: StringMatcher | undefined;
	node: CustomerFilter | null;
} {
	let customerId: StringMatcher | undefined;
	const quantifiers: CustomerFilter[] = [];
	const positivePlanRules: FilterRule[] = [];
	const planProperties = mergePlanProperties(group.rules);

	for (const rule of group.rules) {
		if (rule.field === "customer_id") {
			const matcher = ruleToCustomerIdMatcher(rule);
			if (matcher !== undefined) customerId = matcher;
			continue;
		}

		if (isPositivePlanRule(rule)) {
			positivePlanRules.push(rule);
			continue;
		}

		if (PLAN_PROPERTY_FIELDS.has(rule.field)) continue;

		const quantifier = rule.field === "plan_id" ? planIdQuantifier(rule) : null;
		if (quantifier) quantifiers.push(quantifier);
	}

	if (positivePlanRules.length === 1) {
		const rule = positivePlanRules[0];
		quantifiers.push({
			plan: { ...planKeysToFilter(rule.values), ...(planProperties ?? {}) },
		});
	} else {
		for (const rule of positivePlanRules) {
			const quantifier = planIdQuantifier(rule);
			if (quantifier) quantifiers.push(quantifier);
		}
		if (planProperties) quantifiers.push({ plan: planProperties });
	}

	if (quantifiers.length === 0) return { customerId, node: null };
	if (quantifiers.length === 1) return { customerId, node: quantifiers[0] };
	return { customerId, node: { $and: quantifiers } };
}

export function groupsToMigrationFilter(
	groups: FilterGroupData[],
	base: MigrationFilter,
): MigrationFilter {
	let customerId: StringMatcher | undefined;
	const nodes: CustomerFilter[] = [];
	for (const group of groups) {
		const { customerId: groupCustomerId, node } = groupToNode(group);
		if (groupCustomerId !== undefined) customerId = groupCustomerId;
		if (node) nodes.push(node);
	}

	const customer: CustomerFilter = {};
	if (customerId !== undefined) customer.customer_id = customerId;
	// One node spreads its `plan` / `$and` onto the customer; many nodes OR.
	if (nodes.length === 1) Object.assign(customer, nodes[0]);
	else if (nodes.length > 1) customer.$or = nodes;

	return { ...base, customer };
}

const EMPTY_GROUP: FilterGroupData = {
	rules: [{ field: "plan_id", operator: "is", values: [] }],
};

function isEmptyFilter(groups: FilterGroupData[]): boolean {
	if (groups.length !== 1) return false;
	const rules = groups[0].rules;
	if (rules.length === 0) return true;
	if (rules.length !== 1) return false;
	// A `none` rule is fully specified without any values.
	if (rules[0].operator === "none") return false;
	// Only the pristine plan_id placeholder collapses to the "Add Filter" card;
	// a row switched to another field stays open while the user fills it in.
	if (rules[0].field !== "plan_id") return false;
	return rules[0].values.length === 0;
}

export function FilterForm({
	value,
	onChange,
}: {
	value: MigrationFilter;
	onChange: (value: MigrationFilter) => void;
}) {
	const [autoOpenField, setAutoOpenField] = useState(false);
	const externalKey = useMemo(() => JSON.stringify(value), [value]);
	const lastSyncedKey = useRef(externalKey);
	const groupsRef = useRef<FilterGroupData[]>(buildGroups(value));

	if (lastSyncedKey.current !== externalKey) {
		lastSyncedKey.current = externalKey;
		groupsRef.current = buildGroups(value);
	}

	const setGroups = (next: FilterGroupData[]) => {
		groupsRef.current = next;
		const updated = groupsToMigrationFilter(next, value);
		lastSyncedKey.current = JSON.stringify(updated);
		onChange(updated);
	};

	const groups = groupsRef.current;
	const isEmpty = isEmptyFilter(groups) && !autoOpenField;

	const updateGroup = (index: number, group: FilterGroupData) => {
		const next = [...groups];
		next[index] = group;
		setGroups(next);
	};

	const deleteGroup = (index: number) => {
		const next = groups.filter((_, i) => i !== index);
		if (next.length === 0) {
			setAutoOpenField(false);
			setGroups([EMPTY_GROUP]);
		} else {
			setGroups(next);
		}
	};

	const addGroup = () => setGroups([...groups, EMPTY_GROUP]);

	const clearAll = () => {
		setAutoOpenField(false);
		setGroups([EMPTY_GROUP]);
	};

	const hasConditions = groups.some((g) => g.rules.length > 0);

	if (isEmpty) {
		return (
			<ActionCard
				icon={
					<FunnelSimpleIcon
						size={20}
						weight="duotone"
						className="text-tertiary-foreground shrink-0"
					/>
				}
				heading="Add Filter"
				subheading="Define which customers this migration applies to"
				onClick={() => setAutoOpenField(true)}
				className="w-full"
			/>
		);
	}

	return (
		<div className="flex flex-col">
			{groups.map((group, index) => (
				<div key={`group-${index}`} className="flex flex-col">
					{index > 0 && <div className="border-t my-3" />}
					<FilterGroup
						group={group}
						groupIndex={index}
						onChange={(updated) => updateGroup(index, updated)}
						onDelete={() => deleteGroup(index)}
						showDelete={groups.length > 1}
						autoOpenField={index === 0 && autoOpenField}
					/>
				</div>
			))}
			{hasConditions && (
				<div className="flex items-center gap-2 mt-3">
					<AddButton
						label="OR condition"
						onClick={addGroup}
						className="flex-1"
					/>
					<Button
						variant="skeleton"
						size="sm"
						onClick={clearAll}
						className="text-tertiary-foreground hover:text-destructive shrink-0"
					>
						Clear all
					</Button>
				</div>
			)}
		</div>
	);
}
