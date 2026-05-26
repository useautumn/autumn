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

function buildGroups(value: MigrationFilter): FilterGroupData[] {
	const planFilter =
		(value.customer?.plan as PlanFilter) ?? DEFAULT_PLAN_FILTER;
	const planGroups = planFilterToGroups(planFilter);
	const matcher = value.customer?.customer_id as StringMatcher | undefined;
	const ids = customerIdToStrings(matcher);
	if (ids.length === 0) return planGroups;
	const rule: FilterRule = {
		field: "customer_id",
		operator: inferCustomerIdOperator(matcher, ids.length),
		values: ids,
	};
	const [first, ...rest] = planGroups;
	return [{ rules: [rule, ...(first?.rules ?? [])] }, ...rest];
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
	return rules.length === 1 && rules[0].values.length === 0;
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
