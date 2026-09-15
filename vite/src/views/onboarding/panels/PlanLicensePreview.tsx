import type { FullPlanLicense } from "@autumn/shared";
import { UserFocusIcon } from "@phosphor-icons/react";
import { useOrg } from "@/hooks/common/useOrg";
import { getPlanLicensePreview } from "./getPlanLicensePreview";
import { PlanPreviewItems } from "./PlanPreviewItems";

export function PlanLicensePreview({
	license,
	currency,
}: {
	license: FullPlanLicense;
	currency?: string;
}) {
	const { org } = useOrg();
	const orgDefaultCurrency = org?.default_currency ?? "USD";
	const displayCurrency = currency ?? orgDefaultCurrency;
	const { display, ...preview } = getPlanLicensePreview({
		license,
		currency: displayCurrency,
		orgDefaultCurrency,
	});

	return (
		<div className="flex min-w-0 flex-col gap-1.5">
			<div className="flex min-w-0 items-start gap-1.5">
				<UserFocusIcon
					size={14}
					weight="duotone"
					aria-hidden="true"
					className="mt-0.5 shrink-0 text-subtle"
				/>
				<div className="flex min-w-0 flex-col gap-0.5 text-xs tabular-nums">
					<p className="text-pretty font-medium text-foreground">
						{display.primary_text}
						{license.included > 0 && (
							<span className="font-normal text-subtle"> included</span>
						)}
					</p>
					{display.secondary_text && (
						<p className="text-pretty text-tertiary-foreground">
							{display.secondary_text}
						</p>
					)}
				</div>
			</div>
			{preview.items.length > 0 && (
				<div className="ml-1.5 min-w-0 border-l pl-3.5">
					<PlanPreviewItems {...preview} currency={displayCurrency} />
				</div>
			)}
		</div>
	);
}
