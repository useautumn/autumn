import type { ApprovalFilterKey } from "@autumn/shared";
import type { EditorRowIssue } from "@autumn/shared/api/approvals/editor/index";
import { cn } from "@/lib/utils";
import { AddButton } from "@/views/migrations/migration/shared/AddButton";
import { PinnedFeatureRow } from "./PinnedFeatureRow";
import { RuleWhenGroup } from "./RuleWhenGroup";
import { type RuleGroup, type RuleRowItem, withId } from "./ruleEditorValues";
import { fieldLabel, ruleFieldRegistry } from "./ruleFieldRegistry";
import type { RuleRow } from "./ruleRowCodec";
import { WhenHeader } from "./WhenHeader";

type Groups = RuleGroup[];

const groupLabel = (index: number) => (index === 0 ? "When" : "Or");

/** OR groups of AND rows. One group sits flat under "When"; several each get a card. */
export const RuleWhenSection = ({
	shape,
	pinned,
	groups,
	issues,
	error,
	onPinnedChange,
	onGroupsChange,
}: {
	shape: ApprovalFilterKey;
	pinned: RuleRow | null;
	groups: Groups;
	issues: EditorRowIssue[];
	error?: string;
	onPinnedChange: (row: RuleRow) => void;
	onGroupsChange: (groups: Groups) => void;
}) => {
	const registry = ruleFieldRegistry({ shape });
	const isSplit = groups.length > 1;
	const newRow = () =>
		withId(registry.createRow({ path: registry.defaultPath }));
	const setRows = (index: number, rules: RuleRowItem[]) =>
		onGroupsChange(
			groups.map((group, i) => (i === index ? { ...group, rules } : group)),
		);
	const addRow = (index: number) => {
		const group = groups[index];
		if (!group) return onGroupsChange([withId({ rules: [newRow()] })]);
		setRows(index, [
			...group.rules,
			withId(registry.nextRow({ rows: group.rules })),
		]);
	};
	const addGroup = () =>
		onGroupsChange([...groups, withId({ rules: [newRow()] })]);
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
					label={fieldLabel({ shape, field: pinned.field })}
					issue={pinnedIssue?.message}
					onChange={onPinnedChange}
				/>
			)}
			{groups.map((group, index) => (
				<div key={group.id} className={cn(isSplit && "rounded-xl border p-3")}>
					<RuleWhenGroup
						registry={registry}
						label={isSplit ? groupLabel(index) : undefined}
						followsPinned={Boolean(pinned) && !isSplit}
						rows={group.rules}
						issues={issues.filter((issue) => issue.group === index)}
						onChange={(rules) => setRows(index, rules)}
						onRemove={
							isSplit
								? () => onGroupsChange(groups.filter((_, i) => i !== index))
								: undefined
						}
					/>
					{isSplit && (
						<AddButton label="Add condition" onClick={() => addRow(index)} />
					)}
				</div>
			))}
			<div className="flex gap-2">
				{!isSplit && (
					<AddButton label="Add condition" onClick={() => addRow(0)} />
				)}
				{groups.some((group) => group.rules.length > 0) && (
					<AddButton label='Add "or" group' onClick={addGroup} />
				)}
			</div>
			{error && <p className="text-destructive text-xs">{error}</p>}
		</div>
	);
};
