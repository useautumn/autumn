import { IconButton, InlineAction, Input, Label } from "@autumn/ui";
import { PlusIcon, XIcon } from "@phosphor-icons/react";
import { LABELED_FIELD } from "../fieldLayout";

type Row = { value: string };

export const RowListField = <T extends Row>({
	label,
	rows,
	keyField,
	keyPlaceholder,
	valuePlaceholder,
	addLabel,
	maxRows,
	onChange,
}: {
	label: string;
	rows: T[];
	keyField: Exclude<keyof T & string, "value">;
	keyPlaceholder: string;
	valuePlaceholder: string;
	addLabel: string;
	maxRows?: number;
	onChange: (rows: T[]) => void;
}) => {
	const updateRow = (index: number, patch: Partial<T>) =>
		onChange(
			rows.map((row, rowIndex) =>
				rowIndex === index ? { ...row, ...patch } : row,
			),
		);
	const removeRow = (index: number) =>
		onChange(rows.filter((_, rowIndex) => rowIndex !== index));
	const addRow = () => onChange([...rows, { [keyField]: "", value: "" } as T]);
	const canAddRow = maxRows === undefined || rows.length < maxRows;

	return (
		<div className={LABELED_FIELD}>
			<Label>{label}</Label>
			{rows.map((row, index) => (
				<div key={`${label}-${index}`} className="flex items-center gap-2">
					<Input
						value={String(row[keyField])}
						placeholder={keyPlaceholder}
						onChange={(e) =>
							updateRow(index, { [keyField]: e.target.value } as Partial<T>)
						}
					/>
					<Input
						value={row.value}
						placeholder={valuePlaceholder}
						onChange={(e) =>
							updateRow(index, { value: e.target.value } as Partial<T>)
						}
					/>
					<IconButton
						aria-label={`Remove ${label}`}
						variant="muted"
						size="sm"
						onClick={() => removeRow(index)}
						icon={<XIcon size={12} />}
						className="shrink-0 text-tertiary-foreground hover:text-red-500"
					/>
				</div>
			))}
			{canAddRow && (
				<InlineAction icon={<PlusIcon size={11} />} onClick={addRow}>
					{addLabel}
				</InlineAction>
			)}
		</div>
	);
};
