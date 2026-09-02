import type { CreditSchemaItem } from "@autumn/shared";
import { IconButton, TagInput } from "@autumn/ui";
import { PlusIcon } from "@phosphor-icons/react";
import { useCreditDimensionEditor } from "../hooks/useCreditDimensionEditor";
import { CreditDimensionRateRow } from "./CreditDimensionRateRow";

interface CreditDimensionPriceListProps {
	item: CreditSchemaItem;
	onChange: (item: CreditSchemaItem) => void;
}

/** Fields as pills at the top; one rate per row beneath, a cell per field. */
export function CreditDimensionPriceList({
	item,
	onChange,
}: CreditDimensionPriceListProps) {
	const editor = useCreditDimensionEditor({ item, onChange });
	const baseRate =
		item.tier_behavior === "graduated"
			? "the row's tiered rate"
			: `${item.credit_amount ?? 0} credits`;

	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center gap-2">
				<span className="text-tertiary-foreground text-xs shrink-0 w-14">
					fields
				</span>
				<TagInput
					aria-label="Dimension fields"
					className="flex-1 min-w-0"
					value={editor.fields}
					onChange={editor.setFields}
					placeholder="eg. size, press enter"
				/>
			</div>

			{editor.fields.length > 0 && (
				<div className="flex flex-col gap-2">
					<div className="flex items-center gap-2 text-xs text-tertiary-foreground">
						{editor.fields.map((field) => (
							<span key={field} className="flex-1 min-w-20 truncate">
								{field}
							</span>
						))}
						<span className="ml-auto">rate</span>
					</div>

					{editor.rules.map((rule, index) => (
						<CreditDimensionRateRow
							key={rule.name || `new-${index}`}
							fields={editor.fields}
							rule={rule}
							onChange={(next) => editor.setRule(index, next)}
							onRemove={() => editor.removeRule(index)}
						/>
					))}

					<div className="flex items-center gap-2 text-xs text-tertiary-foreground">
						<span className="flex-1">anything else</span>
						<span className="shrink-0">costs {baseRate}</span>
					</div>

					<IconButton
						type="button"
						variant="muted"
						size="sm"
						className="w-full text-tertiary-foreground text-xs"
						icon={<PlusIcon size={10} />}
						onClick={editor.addRule}
					>
						Add rate
					</IconButton>
				</div>
			)}
		</div>
	);
}
