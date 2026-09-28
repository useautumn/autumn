import {
	MiniCopyButton,
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@autumn/ui";
import { CaretDownIcon } from "@phosphor-icons/react";
import type { MouseEvent } from "react";
import { StripeIcon } from "@/components/v2/icons/AutumnIcons";
import { truncateMiddle } from "@/utils/formatUtils/formatTextUtils";
import type { ReviewStripeId } from "../../utils/review/types/reviewChange";

const stopAccordionToggle = (event: MouseEvent) => event.stopPropagation();

export function ReviewStripeIdsPopover({
	stripeIds,
}: {
	stripeIds: ReviewStripeId[];
}) {
	const [primaryId] = stripeIds;
	if (!primaryId) return null;

	return (
		<Popover>
			<PopoverTrigger
				nativeButton={false}
				render={<span />}
				onClick={stopAccordionToggle}
				className="flex h-5 shrink-0 cursor-pointer items-center gap-1 rounded-md border border-border/50 bg-muted px-1.5 font-mono text-[11px] text-tertiary-foreground transition-colors hover:text-muted-foreground data-popup-open:border-border"
			>
				{truncateMiddle({
					text: primaryId.id,
					headLength: primaryId.id.indexOf("_") + 1,
				})}
				<CaretDownIcon size={10} className="text-subtle" />
			</PopoverTrigger>
			<PopoverContent
				align="start"
				onClick={stopAccordionToggle}
				className="w-auto min-w-72 p-1.5"
			>
				<div className="flex items-center gap-1.5 px-2 pt-0.5 pb-1.5 text-xs font-medium text-muted-foreground">
					<StripeIcon size={11} className="text-indigo-500" />
					Stripe IDs
				</div>
				{stripeIds.map((stripeId) => (
					<div key={stripeId.key} className="flex h-7 items-center gap-3 px-2">
						<span className="w-28 shrink-0 truncate text-xs text-subtle">
							{stripeId.label}
						</span>
						<MiniCopyButton
							text={stripeId.id}
							innerClassName="font-mono text-[11px] text-muted-foreground"
						/>
					</div>
				))}
			</PopoverContent>
		</Popover>
	);
}
