import { Button } from "@autumn/ui";
import { AddButton } from "@/views/migrations/migration/shared/AddButton";
import { FilterGroup } from "./FilterGroup";
import type {
	FilterRegistry,
	FilterRowGroup,
	FilterValueInputs,
} from "./types";

/** OR-joined groups of AND-joined rows. */
export function FilterGroups<
	TFilter,
	TPath extends string,
	TOp extends string,
>({
	registry,
	valueInputs,
	groups,
	onChange,
	onClear,
	autoOpenField = false,
}: {
	registry: FilterRegistry<TFilter, TPath, TOp>;
	valueInputs: FilterValueInputs;
	groups: FilterRowGroup<TPath, TOp>[];
	onChange: (groups: FilterRowGroup<TPath, TOp>[]) => void;
	onClear: () => void;
	autoOpenField?: boolean;
}) {
	const updateGroup = (index: number, group: FilterRowGroup<TPath, TOp>) => {
		const next = [...groups];
		next[index] = group;
		onChange(next);
	};

	const deleteGroup = (index: number) => {
		const next = groups.filter((_, i) => i !== index);
		if (next.length === 0) onClear();
		else onChange(next);
	};

	const addGroup = () =>
		onChange([
			...groups,
			{ rules: [registry.createRow({ path: registry.defaultPath })] },
		]);

	const hasConditions = groups.some((group) => group.rules.length > 0);

	return (
		<div className="flex flex-col">
			{groups.map((group, index) => (
				<div key={`group-${index}`} className="flex flex-col">
					{index > 0 && <div className="border-t my-3" />}
					<FilterGroup
						registry={registry}
						valueInputs={valueInputs}
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
						onClick={onClear}
						className="text-tertiary-foreground hover:text-destructive shrink-0"
					>
						Clear all
					</Button>
				</div>
			)}
		</div>
	);
}
