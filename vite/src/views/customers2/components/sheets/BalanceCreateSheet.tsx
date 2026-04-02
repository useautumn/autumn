import { type Feature, FeatureType, ResetInterval } from "@autumn/shared";
import { CalendarXIcon, InfinityIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import { DateInputUnix } from "@/components/general/DateInputUnix";
import { Button } from "@/components/v2/buttons/Button";
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
import { useCustomerContext } from "../../customer/CustomerContext";

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

	const [isCreating, setIsCreating] = useState(false);
	const [featureId, setFeatureId] = useState<string>("");
	const [balanceId, setBalanceId] = useState("");
	const [includedGrant, setIncludedGrant] = useState("");
	const [unlimited, setUnlimited] = useState(false);
	const [resetInterval, setResetInterval] = useState<string>("");
	const [oneOff, setOneOff] = useState(false);
	const [expiresAt, setExpiresAt] = useState<number | null>(null);

	const nonArchivedFeatures = features.filter((f: Feature) => !f.archived);
	const selectedFeature = nonArchivedFeatures.find(
		(f: Feature) => f.id === featureId,
	);
	const isMetered =
		selectedFeature?.type === FeatureType.Metered ||
		selectedFeature?.type === FeatureType.CreditSystem;

	const handleCreate = async () => {
		const customerId = customer?.id || customer?.internal_id;
		if (!customerId || !featureId) return;

		const params: Record<string, unknown> = {
			customer_id: customerId,
			feature_id: featureId,
		};

		if (entityId) params.entity_id = entityId;
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

		if (expiresAt) {
			params.expires_at = expiresAt;
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
					description="Create a new, standalone balance for this customer that's not associated with any plan."
				/>

				<SheetSection withSeparator>
					<FormLabel>Feature</FormLabel>
					<FeatureSearchDropdown
						features={nonArchivedFeatures}
						value={featureId || null}
						onSelect={setFeatureId}
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
												}
											}}
											className="py-1 w-26 text-t4 gap-2"
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
												if (checked) setResetInterval("");
											}}
											className="py-1 w-26 text-t4 gap-2 justify-start"
										>
											One-off
										</IconCheckbox>
									</div>
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
					<Button
						variant="primary"
						className="w-full"
						onClick={handleCreate}
						isLoading={isCreating}
						disabled={!featureId}
					>
						Create
					</Button>
				</SheetFooter>
			</div>
		</LayoutGroup>
	);
}
