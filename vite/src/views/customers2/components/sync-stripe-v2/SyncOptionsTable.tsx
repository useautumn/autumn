import { Switch } from "@autumn/ui";
import { AdvancedTraySurface } from "@/components/forms/shared/advanced-section/AdvancedTraySurface";
import { ConfigRow } from "@/components/forms/shared/ConfigRow";

export type SyncOptions = {
	expirePrevious: boolean;
	carryOverUsage: boolean;
};

export function SyncOptionsTable({
	options,
	onOptionsChange,
	enablePlanImmediately,
	onEnablePlanImmediatelyChange,
}: {
	options: SyncOptions;
	onOptionsChange: (options: SyncOptions) => void;
	enablePlanImmediately?: boolean;
	onEnablePlanImmediatelyChange?: (enabled: boolean) => void;
}) {
	return (
		<AdvancedTraySurface>
			<ConfigRow
				title="Expire current plans"
				description="End active plans in the same group when the sync runs."
				action={
					<Switch
						checked={options.expirePrevious}
						onCheckedChange={(checked) =>
							onOptionsChange({ ...options, expirePrevious: !!checked })
						}
					/>
				}
			/>
			{options.expirePrevious && (
				<ConfigRow
					title="Carry over usage"
					description="Move used balances onto the new plan for shared features."
					action={
						<Switch
							checked={options.carryOverUsage}
							onCheckedChange={(checked) =>
								onOptionsChange({ ...options, carryOverUsage: !!checked })
							}
						/>
					}
				/>
			)}
			{onEnablePlanImmediatelyChange && (
				<ConfigRow
					title="Enable plan immediately"
					description="Grant access now while billing still starts when the Stripe schedule begins."
					action={
						<Switch
							checked={enablePlanImmediately}
							onCheckedChange={(checked) =>
								onEnablePlanImmediatelyChange(!!checked)
							}
						/>
					}
				/>
			)}
		</AdvancedTraySurface>
	);
}
