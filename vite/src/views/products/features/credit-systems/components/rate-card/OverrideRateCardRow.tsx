import { findFeatureById } from "@autumn/shared";
import { InlineAction } from "@autumn/ui";
import { ArrowCounterClockwiseIcon, CaretUpIcon } from "@phosphor-icons/react";
import { TABLE_TRAY_SURFACE_DIVIDER_CLASS } from "@/components/general/table";
import { cn } from "@/lib/utils";
import type { RateCardEditor } from "../../hooks/useRateCardEditor";
import { featureDisplayName } from "../../utils/featureDisplayName";
import {
	catalogRateOf,
	creditRateLabel,
	type RateCardRow,
} from "../../utils/rateCardRows";
import { RateCardFeatureName } from "./RateCardFeatureName";
import { RateCardRowEditor } from "./RateCardRowEditor";
import { RateStateBadge } from "./RateStateBadge";
import { RateValue } from "./RateValue";

const ROW_CLASS = "flex h-11 items-center gap-1.5 pr-1.5 pl-3";

/** One plan rate card row: at rest it says where its rate comes from, clicked it edits inline. */
export function OverrideRateCardRow({
	row,
	editor,
}: {
	row: RateCardRow;
	editor: RateCardEditor;
}) {
	const { features, edit } = editor;
	const feature = findFeatureById({
		features,
		featureId: row.featureId,
		errorOnNotFound: false,
	});
	const name = featureDisplayName({ features, featureId: row.featureId });
	const rateLabel = (rate: Parameters<typeof creditRateLabel>[0]["rate"]) =>
		creditRateLabel({ rate, features });

	if (row.state === "excluded") {
		return (
			<li className={cn(TABLE_TRAY_SURFACE_DIVIDER_CLASS, ROW_CLASS)}>
				<RateCardFeatureName feature={feature} name={name} muted />
				<RateStateBadge label="Not covered" muted />
				<InlineAction
					className="ml-auto px-1.5"
					icon={<ArrowCounterClockwiseIcon size={13} />}
					onClick={() => editor.restoreCatalogRate(row.catalogRate)}
				>
					Restore
				</InlineAction>
			</li>
		);
	}

	if (edit?.featureId === row.featureId) {
		return (
			<li
				className={cn(TABLE_TRAY_SURFACE_DIVIDER_CLASS, "bg-table-row-hover")}
			>
				<button
					type="button"
					aria-expanded
					onClick={editor.cancel}
					className={cn(ROW_CLASS, "w-full cursor-pointer pr-3 text-left")}
				>
					<RateCardFeatureName feature={feature} name={name} />
					<CaretUpIcon size={14} className="ml-auto text-tertiary-foreground" />
				</button>
				<RateCardRowEditor editor={editor} catalogRate={catalogRateOf(row)} />
			</li>
		);
	}

	return (
		<li
			className={cn(
				TABLE_TRAY_SURFACE_DIVIDER_CLASS,
				ROW_CLASS,
				"hover:bg-table-row-hover",
				row.state !== "changed" && "pr-3",
			)}
		>
			<button
				type="button"
				aria-expanded={false}
				onClick={() => editor.startEdit(row.rate)}
				className="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left"
			>
				<RateCardFeatureName feature={feature} name={name} />
				{row.state === "changed" && <RateStateBadge label="Changed" />}
				{row.state === "added" && <RateStateBadge label="Added" />}
				<span className="ml-auto">
					<RateValue
						rate={rateLabel(row.rate)}
						previousRate={
							row.state === "changed" ? rateLabel(row.catalogRate) : undefined
						}
						muted={row.state === "inherited"}
						stacked
					/>
				</span>
			</button>
			{row.state === "changed" && (
				<InlineAction
					className="px-1.5"
					onClick={() => editor.restoreCatalogRate(row.catalogRate)}
				>
					Reset
				</InlineAction>
			)}
		</li>
	);
}
