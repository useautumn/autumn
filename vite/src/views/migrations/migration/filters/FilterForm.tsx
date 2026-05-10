import type { MigrationFilter, PlanFilter } from "@autumn/shared";
import { ArrowsClockwiseIcon, PlusIcon } from "@phosphor-icons/react";
import { Button } from "@/components/v2/buttons/Button";
import { FilterGroup } from "./FilterGroup";
import {
	type FilterGroupData,
	groupsToPlanFilter,
	planFilterToGroups,
} from "./filterRowTypes";

const DEFAULT_PLAN_FILTER: PlanFilter = { plan_id: "" };

export function FilterForm({
	value,
	onChange,
}: {
	value: MigrationFilter;
	onChange: (value: MigrationFilter) => void;
}) {
	const planFilter: PlanFilter =
		(value.customer?.plan as PlanFilter) ?? DEFAULT_PLAN_FILTER;
	const groups = planFilterToGroups(planFilter);

	const pushGroups = (next: FilterGroupData[]) =>
		onChange({
			...value,
			customer: { ...value.customer, plan: groupsToPlanFilter(next) },
		});

	const updateGroup = (index: number, group: FilterGroupData) => {
		const next = [...groups];
		next[index] = group;
		pushGroups(next);
	};

	const deleteGroup = (index: number) => {
		const next = groups.filter((_, i) => i !== index);
		pushGroups(
			next.length > 0
				? next
				: [
						{
							rules: [{ field: "plan_id", operator: "is", values: [] }],
						},
					],
		);
	};

	const addGroup = () =>
		pushGroups([
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
		pushGroups(next);
	};

	const mergeGroups = (index: number) => {
		if (index <= 0 || index >= groups.length) return;
		const merged = {
			rules: [...groups[index - 1].rules, ...groups[index].rules],
		};
		const next = [...groups];
		next.splice(index - 1, 2, merged);
		pushGroups(next);
	};

	const clearAll = () =>
		pushGroups([{ rules: [{ field: "plan_id", operator: "is", values: [] }] }]);

	return (
		<div className="flex flex-col gap-3">
			{groups.map((group, index) => (
				<div key={`group-${index}`} className="flex flex-col gap-2">
					{index > 0 && (
						<Button
							variant="skeleton"
							size="sm"
							onClick={() => mergeGroups(index)}
							className="w-12 shrink-0 !gap-1 !justify-start"
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
				<Button variant="skeleton" size="sm" onClick={addGroup}>
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
