import type { SetPlansPreviewWarning } from "@autumn/shared";
import { InfoIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

const INFO_WARNING_TYPES: SetPlansPreviewWarning["type"][] = [
	"new_stripe_price_created",
	"proration_disabled",
];

export function ReviewWarnings({
	warnings,
}: {
	warnings: SetPlansPreviewWarning[];
}) {
	if (warnings.length === 0) return null;

	return (
		<div className="flex flex-col gap-2 px-4 pt-4">
			{warnings.map((warning) => {
				const isInfo = INFO_WARNING_TYPES.includes(warning.type);
				const Icon = isInfo ? InfoIcon : WarningCircleIcon;

				return (
					<div
						key={`${warning.type}-${warning.message}`}
						className={cn(
							"flex items-start gap-2 rounded-[8px] px-3 py-2 text-sm",
							isInfo
								? "bg-tertiary-foreground/10 text-tertiary-foreground"
								: "bg-amber-500/10 text-amber-500",
						)}
					>
						<Icon size={16} weight="fill" className="mt-px shrink-0" />
						<span className="flex-1">{warning.message}</span>
					</div>
				);
			})}
		</div>
	);
}
