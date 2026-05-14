import { formatAmount } from "@autumn/shared";
import { MinusCircleIcon, PauseCircleIcon, PlusCircleIcon } from "@phosphor-icons/react";
import { getPreviewCreditAmount } from "@/components/forms/shared/previewCreditUtils";
import { Skeleton } from "@/components/ui/skeleton";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";
import { useAttachFormContext } from "../context/AttachFormProvider";

function AttachUpdatesSkeleton() {
	return (
		<SheetSection withSeparator={false}>
			<div className="flex items-center gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
				<Skeleton className="h-4 w-4 rounded-full shrink-0" />
				<Skeleton className="h-4 w-48" />
			</div>
		</SheetSection>
	);
}

export function AttachUpdatesSection() {
	const { previewQuery, formValues, product, hasActiveSubscription } =
		useAttachFormContext();

	const hasProductSelected = !!formValues.productId;
	const { data: previewData, isPending } = previewQuery;
	const outgoing = previewData?.outgoing ?? [];
	const creditAmount = getPreviewCreditAmount({ previewData });
	const hasCreditIndicator = creditAmount > 0;
	const formattedCreditAmount = hasCreditIndicator
		? formatAmount({
				amount: Number(creditAmount.toFixed(2)),
				currency: previewData?.currency,
				minFractionDigits: 2,
				maxFractionDigits: 2,
				amountFormatOptions: {
					currencyDisplay: "narrowSymbol",
				},
			})
		: null;

	if (!hasProductSelected) {
		return null;
	}

	if (isPending) {
		return <AttachUpdatesSkeleton />;
	}

	if (!product) {
		return null;
	}

	const isPausing =
		formValues.trialOnEnd === "revert" && hasActiveSubscription;
	const outgoingVerb = isPausing ? "pausing" : "removing";

	return (
		<SheetSection withSeparator={false} className="pb-0">
			<InfoBox variant="note">
				<span>
					Attaching{" "}
					<PlusCircleIcon
						weight="fill"
						className="text-green-500 size-3.5 inline align-middle mr-1"
					/>
					<span className="text-foreground font-medium">{product.name}</span>
					{outgoing.length > 0 && (
						<>
							{" "}
							and {outgoingVerb}{" "}
							{outgoing.map((change, index) => {
								const isLast = index === outgoing.length - 1;
								return (
									<span key={change.plan.id}>
										{index > 0 && !isLast && ", "}
										{isLast && index > 0 && " and "}
										{isPausing ? (
										<PauseCircleIcon
											weight="fill"
											className="text-orange-500 size-3.5 inline align-middle mr-1"
										/>
									) : (
										<MinusCircleIcon
											weight="fill"
											className="text-red-500 size-3.5 inline align-middle mr-1"
										/>
									)}
										<span className="text-foreground font-medium">
											{change.plan.name}
										</span>
									</span>
								);
							})}
						</>
					)}
					{hasCreditIndicator && (
						<>
							. This update includes{" "}
							<span className="text-foreground font-medium">
								{formattedCreditAmount}
							</span>{" "}
							in invoice credits.
						</>
					)}
				</span>
			</InfoBox>
		</SheetSection>
	);
}
