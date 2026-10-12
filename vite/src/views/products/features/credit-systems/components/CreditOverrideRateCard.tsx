import { Button, InlineAction } from "@autumn/ui";
import { PlusIcon } from "@phosphor-icons/react";
import { TABLE_TRAY_SURFACE_DIVIDER_CLASS } from "@/components/general/table";
import { useRateCardEditor } from "../hooks/useRateCardEditor";
import { rateCardSubtitle } from "../utils/rateCardRows";
import { OverrideRateCardRow } from "./rate-card/OverrideRateCardRow";
import { RateCardHeader } from "./rate-card/RateCardHeader";
import { RateCardRowEditor } from "./rate-card/RateCardRowEditor";
import { RateCardTray } from "./rate-card/RateCardTray";

/** A plan item's rate card: the credit system's rates with this plan's changes on top. */
export function CreditOverrideRateCard() {
	const editor = useRateCardEditor();
	const { creditSystem, summary, edit } = editor;
	const creditSystemName = creditSystem?.name ?? "the credit system";
	const hasChanges = summary.rows.some((row) => row.state !== "inherited");

	return (
		<div className="flex flex-col gap-2.5">
			<RateCardHeader
				subtitle={rateCardSubtitle({ creditSystemName, summary })}
				action={
					hasChanges && (
						<InlineAction className="px-1.5" onClick={editor.resetAll}>
							Reset all
						</InlineAction>
					)
				}
			/>
			<RateCardTray>
				{summary.rows.map((row) => (
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
			</RateCardTray>
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
		</div>
	);
}
