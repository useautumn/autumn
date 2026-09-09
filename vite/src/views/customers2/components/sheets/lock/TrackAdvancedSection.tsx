import {
	IconCheckbox,
	Input,
	SheetAccordion,
	SheetAccordionItem,
	Switch,
} from "@autumn/ui";
import { ConfigRow } from "@/components/forms/shared/advanced-section";
import { cn } from "@/lib/utils";

export type FinalizeLockAction = "confirm" | "release";

export type FinalizeLockConfig = {
	enabled: boolean;
	lockId: string;
	action: FinalizeLockAction;
	overrideValue: string;
};

export const DEFAULT_FINALIZE_LOCK_CONFIG: FinalizeLockConfig = {
	enabled: false,
	lockId: "",
	action: "confirm",
	overrideValue: "",
};

const ACTION_DESCRIPTIONS: Record<FinalizeLockAction, string> = {
	confirm: "Commit the reserved balance, optionally at a different value.",
	release: "Return the full reserved balance to the customer.",
};

export function TrackAdvancedSection({
	finalize,
	onFinalizeChange,
}: {
	finalize: FinalizeLockConfig;
	onFinalizeChange: (finalize: FinalizeLockConfig) => void;
}) {
	const isConfirm = finalize.action === "confirm";

	return (
		<SheetAccordion withSeparator={false}>
			<SheetAccordionItem value="advanced" title="Advanced">
				<ConfigRow
					title="Finalize a lock"
					description="Settle a balance reserved by a previous check with a lock instead of recording new usage"
					expanded={finalize.enabled}
					action={
						<Switch
							aria-label="Finalize a lock"
							checked={finalize.enabled}
							onCheckedChange={(enabled) =>
								onFinalizeChange({ ...finalize, enabled })
							}
						/>
					}
				>
					<div className="space-y-4 pt-2">
						<ConfigRow
							title="Lock ID"
							description="The lock_id passed to the check call"
						>
							<Input
								placeholder="lck_..."
								value={finalize.lockId}
								onChange={(e) =>
									onFinalizeChange({ ...finalize, lockId: e.target.value })
								}
								className="font-mono text-xs"
							/>
						</ConfigRow>

						<ConfigRow
							title="Action"
							description={ACTION_DESCRIPTIONS[finalize.action]}
							action={
								<div className="flex">
									<IconCheckbox
										variant="secondary"
										size="sm"
										checked={isConfirm}
										onCheckedChange={() =>
											onFinalizeChange({ ...finalize, action: "confirm" })
										}
										className={cn(
											"min-w-[76px] px-2 text-xs rounded-r-none",
											!isConfirm && "border-r-0",
										)}
									>
										Confirm
									</IconCheckbox>
									<IconCheckbox
										variant="secondary"
										size="sm"
										checked={!isConfirm}
										onCheckedChange={() =>
											onFinalizeChange({
												...finalize,
												action: "release",
												overrideValue: "",
											})
										}
										className={cn(
											"min-w-[76px] px-2 text-xs rounded-l-none",
											isConfirm && "border-l-0",
										)}
									>
										Release
									</IconCheckbox>
								</div>
							}
						/>

						<ConfigRow
							title="Override value"
							description="Leave empty to confirm the amount that was locked"
							expanded={isConfirm}
						>
							<Input
								placeholder="Same as locked"
								type="number"
								value={finalize.overrideValue}
								onChange={(e) =>
									onFinalizeChange({
										...finalize,
										overrideValue: e.target.value,
									})
								}
							/>
						</ConfigRow>
					</div>
				</ConfigRow>
			</SheetAccordionItem>
		</SheetAccordion>
	);
}
