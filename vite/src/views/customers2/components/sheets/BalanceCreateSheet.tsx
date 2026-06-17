import {
	type Feature,
	FeatureType,
	type FullCustomer,
	isContUseFeature,
	ResetInterval,
	type RolloverConfig,
} from "@autumn/shared";
import { CalendarXIcon, InfinityIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import { DateInputUnix } from "@/components/general/DateInputUnix";
import { Button } from "@/components/v2/buttons/Button";
import { ShortcutButton } from "@/components/v2/buttons/ShortcutButton";
import { IconCheckbox } from "@/components/v2/checkboxes/IconCheckbox";
import { FeatureSearchDropdown } from "@/components/v2/dropdowns/FeatureSearchDropdown";
import { FormLabel } from "@/components/v2/form/FormLabel";
import { Input } from "@/components/v2/inputs/Input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/v2/selects/Select";
import {
	LayoutGroup,
	SheetFooter,
	SheetHeader,
	SheetSection,
} from "@/components/v2/sheets/SharedSheetComponents";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { RolloverConfigForm } from "@/views/products/plan/components/edit-plan-feature/advanced-settings/RolloverConfigForm";
import { useCustomerContext } from "../../customer/CustomerContext";
import { EntityScopeSelector } from "./EntityScopeSelector";

const RESET_INTERVAL_LABELS: Record<string, string> = {
	[ResetInterval.Minute]: "Minute",
	[ResetInterval.Hour]: "Hour",
	[ResetInterval.Day]: "Day",
	[ResetInterval.Week]: "Week",
	[ResetInterval.Month]: "Month",
	[ResetInterval.Quarter]: "Quarter",
	[ResetInterval.SemiAnnual]: "Semi-annual",
	[ResetInterval.Year]: "Year",
};

export function BalanceCreateSheet() {
	const closeSheet = useSheetStore((s) => s.closeSheet);
	const { customer, refetch } = useCusQuery();
	const { entityId } = useCustomerContext();
	const { features } = useFeaturesQuery();
	const axiosInstance = useAxiosInstance();

	const entities = (customer as FullCustomer | null)?.entities ?? [];

	const [isCreating, setIsCreating] = useState(false);
	const [scopeEntityId, setScopeEntityId] = useState<string | undefined>(
		() => entityId ?? undefined,
	);
	const [featureId, setFeatureId] = useState<string>("");
	const [balanceId, setBalanceId] = useState("");
	const [includedGrant, setIncludedGrant] = useState("");
	const [unlimited, setUnlimited] = useState(false);
	const [resetInterval, setResetInterval] = useState<string>("");
	const [oneOff, setOneOff] = useState(false);
	const [expiresAt, setExpiresAt] = useState<number | null>(null);
	const [nextResetAt, setNextResetAt] = useState<number | null>(null);
	const [rollover, setRollover] = useState<RolloverConfig | null>(null);

	// Rollover requires a recurring reset interval. If the interval goes away
	// (or the user picks one-off/unlimited), clear rollover to keep state valid.
	const hasRecurringReset = Boolean(resetInterval) && !oneOff && !unlimited;

	const nonArchivedFeatures = features.filter((f: Feature) => !f.archived);
	const selectedFeature = nonArchivedFeatures.find(
		(f: Feature) => f.id === featureId,
	);
	const isMetered =
		selectedFeature?.type === FeatureType.Metered ||
		selectedFeature?.type === FeatureType.CreditSystem;

	// Continuous-use features (non-consumable) don't support rollover — the
	// server rejects it in validateCreateBalanceParams, so we gate the UI too.
	const isContUse = selectedFeature
		? isContUseFeature({ feature: selectedFeature })
		: false;
	const canEnableRollover = isMetered && !isContUse && hasRecurringReset;

	/**
	 * Authoritative feature-select handler.
	 *
	 * Rollover is only valid for metered/credit-system features that are
	 * consumable (non-continuous). When the user swaps features, clear any
	 * existing rollover state synchronously here — no useEffect needed.
	 */
	const handleSelectFeature = (nextFeatureId: string) => {
		setFeatureId(nextFeatureId);
		const nextFeature = nonArchivedFeatures.find(
			(f: Feature) => f.id === nextFeatureId,
		);
		const nextIsMetered =
			nextFeature?.type === FeatureType.Metered ||
			nextFeature?.type === FeatureType.CreditSystem;
		const nextIsContUse = nextFeature
			? isContUseFeature({ feature: nextFeature })
			: false;
		if (!nextIsMetered || nextIsContUse) {
			setRollover(null);
		}
		// next_reset_at only applies to a resetting (metered) balance.
		if (!nextIsMetered) {
			setNextResetAt(null);
		}
	};

	const handleCreate = async () => {
		const customerId = customer?.id || customer?.internal_id;
		if (!customerId || !featureId) return;

		const params: Record<string, unknown> = {
			customer_id: customerId,
			feature_id: featureId,
		};

		if (scopeEntityId) params.entity_id = scopeEntityId;
		if (balanceId.trim()) params.balance_id = balanceId.trim();

		if (isMetered) {
			if (unlimited) {
				params.unlimited = true;
			} else if (includedGrant.trim()) {
				const grant = parseFloat(includedGrant);
				if (Number.isNaN(grant)) {
					toast.error("Please enter a valid number for included grant");
					return;
				}
				params.included_grant = grant;
			} else {
				toast.error("Please provide an included grant or mark as unlimited");
				return;
			}
		}

		if (resetInterval && !oneOff && !unlimited) {
			params.reset = { interval: resetInterval };
		}

		if (rollover && canEnableRollover) {
			params.rollover = rollover;
		}

		if (expiresAt) {
			params.expires_at = expiresAt;
		}

		// next_reset_at sets a custom first reset boundary. It requires a recurring
		// reset, must be in the future, and must precede expires_at — match the
		// server-side validation so we fail fast with a clear message.
		if (nextResetAt && hasRecurringReset) {
			if (nextResetAt <= Date.now()) {
				toast.error("Next reset must be in the future");
				return;
			}
			if (expiresAt && nextResetAt >= expiresAt) {
				toast.error("Next reset must be before the expiry date");
				return;
			}
			params.next_reset_at = nextResetAt;
		}

		setIsCreating(true);
		try {
			await axiosInstance.post("/v1/balances.create", params);
			await refetch();
			closeSheet();
			toast.success("Balance created");
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to create balance"));
		} finally {
			setIsCreating(false);
		}
	};

	return (
		<LayoutGroup>
			<div className="flex h-full flex-col overflow-y-auto">
				<SheetHeader
					title="Create Balance"
					description="Create a separate balance for this customer that is not associated with any plan."
				/>

				{entities.length > 0 && (
					<EntityScopeSelector
						entities={entities}
						scopeEntityId={scopeEntityId}
						onScopeChange={setScopeEntityId}
					/>
				)}

				<SheetSection withSeparator>
					<FormLabel>Feature</FormLabel>
					<FeatureSearchDropdown
						features={nonArchivedFeatures}
						value={featureId || null}
						onSelect={handleSelectFeature}
					/>
				</SheetSection>

				{selectedFeature && (
					<SheetSection withSeparator={false}>
						<div className="flex flex-col gap-3">
							<div>
								<FormLabel>Balance ID</FormLabel>
								<Input
									placeholder="Optional unique identifier"
									value={balanceId}
									onChange={(e) => setBalanceId(e.target.value)}
								/>
							</div>

							{isMetered && (
								<div>
									<FormLabel>Grant Amount</FormLabel>
									<div className="flex items-center gap-2">
										<Input
											placeholder="eg, 100"
											type="number"
											value={unlimited ? "Unlimited" : includedGrant}
											disabled={unlimited}
											onChange={(e) => setIncludedGrant(e.target.value)}
										/>
										<IconCheckbox
											icon={<InfinityIcon />}
											iconOrientation="left"
											variant="muted"
											size="default"
											checked={unlimited}
											onCheckedChange={(checked) => {
												setUnlimited(checked);
												if (checked) {
													setIncludedGrant("");
													setResetInterval("");
													setOneOff(false);
													setRollover(null);
													setNextResetAt(null);
												}
											}}
											className="py-1 w-26 text-subtle gap-2"
										>
											Unlimited
										</IconCheckbox>
									</div>
								</div>
							)}

							{isMetered && !unlimited && (
								<div>
									<FormLabel>Interval</FormLabel>
									<div className="flex items-center gap-2">
										<Select
											value={oneOff ? undefined : resetInterval}
											onValueChange={setResetInterval}
											disabled={oneOff}
											items={RESET_INTERVAL_LABELS}
										>
											<SelectTrigger className="w-full">
												<SelectValue placeholder="None" />
											</SelectTrigger>
											<SelectContent>
												{Object.entries(RESET_INTERVAL_LABELS).map(
													([value, label]) => (
														<SelectItem key={value} value={value}>
															{label}
														</SelectItem>
													),
												)}
											</SelectContent>
										</Select>
										<IconCheckbox
											icon={<CalendarXIcon />}
											iconOrientation="left"
											variant="secondary"
											size="default"
											checked={oneOff}
											onCheckedChange={(checked) => {
												setOneOff(checked);
												if (checked) {
													setResetInterval("");
													setRollover(null);
													setNextResetAt(null);
												}
											}}
											className="py-1 w-26 text-subtle gap-2 justify-start"
										>
											One-off
										</IconCheckbox>
									</div>
								</div>
							)}

							{isMetered && hasRecurringReset && (
								<div className="flex flex-col shrink-0 w-full">
									<FormLabel>Next Reset At</FormLabel>
									<DateInputUnix
										unixDate={nextResetAt}
										setUnixDate={setNextResetAt}
										withTime
										use24Hour
									/>
								</div>
							)}

							{isMetered && (
								<div className="flex flex-col shrink-0 w-full">
									<FormLabel>Expires At</FormLabel>
									<DateInputUnix
										unixDate={expiresAt}
										setUnixDate={setExpiresAt}
										withTime
										use24Hour
									/>
								</div>
							)}

							{isMetered && !unlimited && !isContUse && (
								<RolloverConfigForm
									value={rollover}
									onChange={setRollover}
									disabled={!canEnableRollover}
								/>
							)}
						</div>
					</SheetSection>
				)}

				<div className="flex-1" />

				<SheetFooter>
					<Button
						variant="secondary"
						className="w-full"
						onClick={closeSheet}
						disabled={isCreating}
					>
						Cancel
					</Button>
					<ShortcutButton
						variant="primary"
						className="w-full"
						onClick={() => handleCreate()}
						isLoading={isCreating}
						disabled={!featureId}
						metaShortcut="enter"
					>
						Create
					</ShortcutButton>
				</SheetFooter>
			</div>
		</LayoutGroup>
	);
}
