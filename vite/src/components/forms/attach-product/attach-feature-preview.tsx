import { useStore } from "@tanstack/react-form";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useAttachProductFormContext } from "./attach-product-form-context";
import { useAttachPreview } from "./use-attach-preview";
import { useFeatureBalanceChanges } from "./use-feature-balance-changes";

export function AttachFeaturePreview() {
	const form = useAttachProductFormContext();
	const { customerId } = useStore(form.store, (state) => state.values);
	const { customer } = useCusQuery({ enabled: !!customerId });
	const { data: previewData } = useAttachPreview();

	const featureChanges = useFeatureBalanceChanges({ customer, previewData });

	if (!featureChanges.length) return null;

	return (
		<div className="space-y-2 pt-3 border-t border-border">
			<div className="text-xs font-medium text-t2 uppercase tracking-wide">
				Balance Changes
			</div>
			<div className="space-y-1.5">
				{featureChanges.map((change) => {
					const displayUnit =
						change.display?.plural ||
						change.display?.singular ||
						change.featureName.toLowerCase();

					return (
						<div
							key={change.featureId}
							className="flex items-center justify-between text-sm"
						>
							<span className="text-t2 capitalize">{displayUnit}</span>
							<div className="flex items-center gap-2">
								{change.status === "removed" ? (
									<span className="text-t3 line-through">
										{change.currentBalance}
									</span>
								) : change.status === "added" ? (
									<span className="text-t1 font-medium">
										{change.newBalance}
									</span>
								) : (
									<>
										<span className="text-t2">{change.currentBalance}</span>
										<span className="text-t3">→</span>
										<span className="text-t1 font-medium">
											{change.newBalance}
										</span>
									</>
								)}
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}
