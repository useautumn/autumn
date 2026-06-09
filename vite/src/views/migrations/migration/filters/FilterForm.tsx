import type {
	MigrationFilter,
	PlanFilter,
	StringMatcher,
} from "@autumn/shared";
import { FunnelSimpleIcon } from "@phosphor-icons/react";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/v2/buttons/Button";
import { ActionCard } from "../shared/ActionCard";
import { AddButton } from "../shared/AddButton";
import { FilterGroup } from "./FilterGroup";
import {
	customerIdToStrings,
	type FilterGroupData,
	type FilterOperator,
	type FilterRule,
	groupsToPlanFilter,
	planFilterToGroups,
	stringsToCustomerId,
} from "./filterRowTypes";

const DEFAULT_PLAN_FILTER: PlanFilter = { plan_id: "" };

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

/** Flip a `plan_id` rule between the `in` (positive) and `not_in` forms. */
function flipPlanIdInToNotIn(groups: FilterGroupData[]): FilterGroupData[] {
	return groups.map((g) => ({
		rules: g.rules.map((r) =>
			r.field === "plan_id" && r.operator === "in"
				? { ...r, operator: "not_in" as FilterOperator }
				: r,
		),
	}));
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

function buildGroups(value: MigrationFilter): FilterGroupData[] {
	const customerIdRule = customerIdRuleFromValue(value);
	const plan = value.customer?.plan;

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

	// `{ $none: <inner> }` is the empty-inclusive "not on plan X" — decode the
	// inner filter and flip its `plan_id` rule back to `not_in`.
	const noneInner = planNoneInner(plan);
	if (noneInner) {
		const groups = flipPlanIdInToNotIn(planFilterToGroups(noneInner));
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
 * Inner filter for a customer-level `$none` quantifier, or null when the groups
 * carry no plan negation. "has none" → `{}`; a `plan_id` "not in [X]" rule →
 * the group's plan filter with `plan_id` flipped to `$in` (negated by `$none`).
 */
function groupsToPlanNone(groups: FilterGroupData[]): PlanFilter | null {
	if (groups.some((g) => g.rules.some((r) => r.operator === "none"))) return {};

	const hasPlanNotIn = groups.some((g) =>
		g.rules.some(
			(r) =>
				r.field === "plan_id" &&
				r.operator === "not_in" &&
				r.values.length > 0,
		),
	);
	if (!hasPlanNotIn) return null;

	const flipped = groups.map((g) => ({
		rules: g.rules.map((r) =>
			r.field === "plan_id" && r.operator === "not_in"
				? { ...r, operator: "in" as FilterOperator }
				: r,
		),
	}));
	return groupsToPlanFilter(flipped);
}

function groupsToMigrationFilter(
	groups: FilterGroupData[],
	base: MigrationFilter,
): MigrationFilter {
	let customerIdMatcher: StringMatcher | undefined;
	const cleaned = groups.map((g) => ({
		rules: g.rules.filter((r) => {
			if (r.field === "customer_id") {
				customerIdMatcher = ruleToCustomerIdMatcher(r);
				return false;
			}
			return true;
		}),
	}));
	// Plan negation is a customer-level quantifier ($none), not a per-plan
	// matcher: "has none" → $none: {}, and "plan_id not in [X]" →
	// $none: { plan_id: { $in: [X] } } so zero-plan customers are included.
	const noneInner = groupsToPlanNone(cleaned);
	if (noneInner) {
		return {
			...base,
			customer: {
				...base.customer,
				customer_id: customerIdMatcher,
				plan: { $none: noneInner },
			},
		};
	}

	const planFilter = groupsToPlanFilter(cleaned);
	const hasPlanFilter = Object.keys(planFilter).length > 0;
	return {
		...base,
		customer: {
			...base.customer,
			customer_id: customerIdMatcher,
			plan: hasPlanFilter ? planFilter : undefined,
		},
	};
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
					<AddButton label="OR condition" onClick={addGroup} className="flex-1" />
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
