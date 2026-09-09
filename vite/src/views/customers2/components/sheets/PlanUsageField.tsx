import type { ApiUsageLimit } from "@autumn/shared";
import { FormLabel } from "@autumn/ui";
import { NumericDraftInput } from "@/views/products/features/credit-systems/components/NumericDraftInput";

export function PlanUsageField({
	usageLimit,
	draftUsage,
	onDraftChange,
	isNegative,
	onSubmit,
}: {
	usageLimit: ApiUsageLimit;
	draftUsage: number | undefined;
	onDraftChange: (value: number | undefined) => void;
	isNegative: boolean;
	onSubmit: () => void;
}) {
	return (
		<div>
			<FormLabel>Current usage</FormLabel>
			<div className="relative">
				<NumericDraftInput
					aria-label="Current usage"
					className="w-full pr-16"
					variant={isNegative ? "destructive" : undefined}
					value={draftUsage}
					onCommit={onDraftChange}
					allowUndefined
					placeholder="0"
					onKeyDown={(event) => {
						if (event.key === "Enter") onSubmit();
					}}
				/>
				<span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-sm text-subtle">
					/ {usageLimit.limit.toLocaleString()}
				</span>
			</div>
		</div>
	);
}
