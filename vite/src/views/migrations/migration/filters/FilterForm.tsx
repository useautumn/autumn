import type { MigrationFilter, PlanFilter, StringMatcher } from "@autumn/shared";
import { ArrowsClockwiseIcon, PlusIcon } from "@phosphor-icons/react";
import { useMemo, useRef } from "react";
import { Button } from "@/components/v2/buttons/Button";
import { FilterGroup } from "./FilterGroup";
import {
	type FilterGroupData,
	type FilterOperator,
	type FilterRule,
	customerIdToStrings,
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

function ruleToCustomerIdMatcher(
	rule: FilterRule,
): StringMatcher | undefined {
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

export function FilterForm({
	value,
	onChange,
}: {
	value: MigrationFilter;
	onChange: (value: MigrationFilter) => void;
}) {
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

	const updateGroup = (index: number, group: FilterGroupData) => {
		const next = [...groups];
		next[index] = group;
		setGroups(next);
	};

	const deleteGroup = (index: number) => {
		const next = groups.filter((_, i) => i !== index);
		setGroups(
			next.length > 0
				? next
				: [{ rules: [{ field: "plan_id", operator: "is", values: [] }] }],
		);
	};

	const addGroup = () =>
		setGroups([
			...groups,
			{ rules: [{ field: "plan_id", operator: "is", values: [] }] },
		]);

	const splitGroupAt = (groupIndex: number, ruleIndex: number) => {
		const group = groups[groupIndex];
		const before = { rules: group.rules.slice(0, ruleIndex) };
		const after = { rules: group.rules.slice(ruleIndex) };
		if (before.rules.length === 0 || after.rules.length === 0) return;
		const next = [...groups];
		next.splice(groupIndex, 1, before, after);
		setGroups(next);
	};

	const mergeGroups = (index: number) => {
		if (index <= 0 || index >= groups.length) return;
		const merged = {
			rules: [...groups[index - 1].rules, ...groups[index].rules],
		};
		const next = [...groups];
		next.splice(index - 1, 2, merged);
		setGroups(next);
	};

	const clearAll = () =>
		setGroups([{ rules: [{ field: "plan_id", operator: "is", values: [] }] }]);

	return (
		<div className="flex flex-col gap-3">
			{groups.map((group, index) => (
				<div key={`group-${index}`} className="flex flex-col gap-2">
					{index > 0 && (
						<Button
							variant="skeleton"
							size="sm"
							onClick={() => mergeGroups(index)}
							className="w-12 shrink-0 !gap-1 !justify-start text-t4 hover:text-t2"
							title="Click to merge into And"
						>
							Or
							<ArrowsClockwiseIcon size={10} className="opacity-40" />
						</Button>
					)}
					<FilterGroup
						group={group}
						onChange={(updated) => updateGroup(index, updated)}
						onDelete={() => deleteGroup(index)}
						onSplitAt={(ruleIndex) => splitGroupAt(index, ruleIndex)}
						showDelete={groups.length > 1}
					/>
				</div>
			))}
			<div className="flex items-center justify-between pt-1">
				<Button variant="skeleton" size="sm" onClick={addGroup} className="text-t4 hover:text-t2">
					<PlusIcon size={10} />
					Add filter group
				</Button>
				{groups.some((g) => g.rules.length > 0) && (
					<Button
						variant="skeleton"
						size="sm"
						onClick={clearAll}
						className="text-t3 hover:text-destructive"
					>
						Clear all filters
					</Button>
				)}
			</div>
		</div>
	);
}
