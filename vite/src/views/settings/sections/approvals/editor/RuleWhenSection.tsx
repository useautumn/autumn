import type { EditorRowIssue, WhenKey } from "@autumn/shared";
import { cn } from "@/lib/utils";
import { AddButton } from "@/views/migrations/migration/shared/AddButton";
import { PinnedFeatureRow } from "./PinnedFeatureRow";
import { RuleWhenGroup } from "./RuleWhenGroup";
import type { RuleEditorValues } from "./ruleEditorValues";
import { fieldLabel, ruleFieldRegistry } from "./ruleFieldRegistry";
import type { RuleRow } from "./ruleRowCodec";
import { WhenHeader } from "./WhenHeader";

type Groups = RuleEditorValues["groups"];

const groupLabel = (index: number) => (index === 0 ? "When" : "Or");

/** OR groups of AND rows. One group sits flat under "When"; several each get a card. */
export const RuleWhenSection = ({
	area,
	pinned,
	groups,
	issues,
	error,
	onPinnedChange,
	onGroupsChange,
}: {
	area: WhenKey;
	pinned: RuleRow | null;
	groups: Groups;
	issues: EditorRowIssue[];
	error?: string;
	onPinnedChange: (row: RuleRow) => void;
	onGroupsChange: (groups: Groups) => void;
}) => {
	const registry = ruleFieldRegistry({ area });
	const isSplit = groups.length > 1;
	const setRows = (index: number, rules: RuleRow[]) =>
		onGroupsChange(groups.map((group, i) => (i === index ? { rules } : group)));
	const addRow = () => {
		const last = groups.at(-1);
		if (!last)
			return onGroupsChange([
				{ rules: [registry.createRow({ path: registry.defaultPath })] },
			]);
		setRows(groups.length - 1, [
			...last.rules,
			registry.nextRow({ rows: last.rules }),
		]);
	};
	const addGroup = () =>
		onGroupsChange([
			...groups,
			{ rules: [registry.createRow({ path: registry.defaultPath })] },
		]);
	const pinnedIssue = issues.find((issue) => issue.group === "pinned");

	return (
		<div className="flex flex-col gap-3">
			{!isSplit && (
				<WhenHeader
					label="When"
					count={(pinned ? 1 : 0) + (groups[0]?.rules.length ?? 0)}
				/>
			)}
			{pinned && (
				<PinnedFeatureRow
					row={pinned}
					label={fieldLabel({ area, field: pinned.field })}
					issue={pinnedIssue?.message}
					onChange={onPinnedChange}
				/>
			)}
			{groups.map((group, index) => (
				<div
					key={`group-${index}`}
					className={cn(isSplit && "rounded-xl border p-3")}
				>
					<RuleWhenGroup
						registry={registry}
						label={isSplit ? groupLabel(index) : undefined}
						rows={group.rules}
						issues={issues.filter((issue) => issue.group === index)}
						onChange={(rules) => setRows(index, rules)}
						onRemove={
							isSplit
								? () => onGroupsChange(groups.filter((_, i) => i !== index))
								: undefined
						}
					/>
				</div>
			))}
			<div className="flex gap-2">
				<AddButton label="Add condition" onClick={addRow} />
				{groups.some((group) => group.rules.length > 0) && (
					<AddButton label='Add "or" group' onClick={addGroup} />
				)}
			</div>
			{error && <p className="text-destructive text-xs">{error}</p>}
		</div>
	);
};
