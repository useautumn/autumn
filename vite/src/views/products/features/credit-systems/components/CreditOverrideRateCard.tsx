import { Button, InlineAction } from "@autumn/ui";
import { PlusIcon } from "@phosphor-icons/react";
import { TABLE_TRAY_SURFACE_DIVIDER_CLASS } from "@/components/general/table";
import { useRateCardEditor } from "../hooks/useRateCardEditor";
import { rateCardSubtitle } from "../utils/rateCardRows";
import { OverrideRateCardRow } from "./rate-card/OverrideRateCardRow";
import { RateCardRowEditor } from "./rate-card/RateCardRowEditor";
import { RateCardTable } from "./rate-card/RateCardTable";

/** A plan item's rate card: the credit system's rates with this plan's changes on top. */
export function CreditOverrideRateCard() {
	const editor = useRateCardEditor();
	const { creditSystem, rows, edit } = editor;
	const creditSystemName = creditSystem?.name ?? "the credit system";

	return (
		<RateCardTable
			subtitle={rateCardSubtitle({ creditSystemName, rows })}
			action={
				rows.some((row) => row.state !== "inherited") && (
					<InlineAction className="px-1.5" onClick={editor.resetAll}>
						Reset all
					</InlineAction>
				)
			}
			footer={
				<Button
					variant="dotted"
					size="sm"
					className="w-full text-tertiary-foreground"
					disabled={editor.addableFeatures.length === 0 || edit !== null}
					onClick={editor.startAdd}
				>
					<PlusIcon size={12} />
					Add a feature {creditSystemName} does not cover
				</Button>
			}
		>
			{rows.map((row) => (
				<OverrideRateCardRow key={row.featureId} row={row} editor={editor} />
			))}
			{edit?.featureId === null && (
				<li className={TABLE_TRAY_SURFACE_DIVIDER_CLASS}>
					<div className="flex h-11 items-center pl-3 font-medium text-sm">
						New feature
					</div>
					<RateCardRowEditor editor={editor} />
				</li>
			)}
		</RateCardTable>
	);
}
