import {
	Button,
	Input,
	SheetAccordion,
	SheetAccordionItem,
	Switch,
} from "@autumn/ui";
import { ArrowsClockwiseIcon } from "@phosphor-icons/react";
import { nanoid } from "nanoid";
import { ConfigRow } from "@/components/forms/shared/advanced-section";
import {
	LOCK_OVERAGE_DESCRIPTIONS,
	type LockOverageBehavior,
	LockOverageBehaviorToggle,
} from "./LockOverageBehaviorToggle";

export type CheckLockConfig = {
	enabled: boolean;
	lockId: string;
	overageBehavior: LockOverageBehavior;
};

export const DEFAULT_CHECK_LOCK_CONFIG: CheckLockConfig = {
	enabled: false,
	lockId: "",
	overageBehavior: "reject",
};

export const generateLockId = () => `lck_${nanoid(12)}`;

export function CheckAdvancedSection({
	lock,
	onLockChange,
}: {
	lock: CheckLockConfig;
	onLockChange: (lock: CheckLockConfig) => void;
}) {
	return (
		<SheetAccordion>
			<SheetAccordionItem value="advanced" title="Advanced">
				<ConfigRow
					title="Lock balance"
					description="Reserve the required balance upfront, then confirm or release it with balances.finalize"
					expanded={lock.enabled}
					action={
						<Switch
							checked={lock.enabled}
							onCheckedChange={(enabled) =>
								onLockChange({
									...lock,
									enabled,
									lockId:
										enabled && !lock.lockId ? generateLockId() : lock.lockId,
								})
							}
						/>
					}
				>
					<div className="space-y-4 pt-2">
						<ConfigRow
							title="Lock ID"
							description="Pass this ID to balances.finalize"
						>
							<div className="flex items-center gap-2">
								<Input
									placeholder="lck_..."
									value={lock.lockId}
									onChange={(e) =>
										onLockChange({ ...lock, lockId: e.target.value })
									}
									className="flex-1 font-mono text-xs"
								/>
								<Button
									variant="secondary"
									size="sm"
									onClick={() =>
										onLockChange({ ...lock, lockId: generateLockId() })
									}
									className="shrink-0 gap-1 text-xs text-tertiary-foreground"
								>
									<ArrowsClockwiseIcon size={12} />
									New
								</Button>
							</div>
						</ConfigRow>

						<ConfigRow
							title="Overage behavior"
							description={LOCK_OVERAGE_DESCRIPTIONS[lock.overageBehavior]}
							action={
								<LockOverageBehaviorToggle
									value={lock.overageBehavior}
									onChange={(overageBehavior) =>
										onLockChange({ ...lock, overageBehavior })
									}
								/>
							}
						/>
					</div>
				</ConfigRow>
			</SheetAccordionItem>
		</SheetAccordion>
	);
}
