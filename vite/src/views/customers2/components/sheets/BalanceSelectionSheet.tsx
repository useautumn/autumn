import {
	EntInterval,
	type Entity,
	FeatureType,
	getCusEntBalance,
	isUnlimitedCusEnt,
} from "@autumn/shared";
import { AdminHover } from "@/components/general/AdminHover";
import { InfoTooltip } from "@/components/general/modal-components/InfoTooltip";
import { Button } from "@/components/v2/buttons/Button";
import { CopyButton } from "@/components/v2/buttons/CopyButton";
import { InfoRow } from "@/components/v2/InfoRow";
import { SheetHeader, SheetSection } from "@/components/v2/sheets/InlineSheet";
import { useCustomerBalanceSheetStore } from "@/hooks/stores/useCustomerBalanceSheetStore";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { formatUnixToDateTime } from "@/utils/formatUtils/formatDateUtils";
import { notNullish } from "@/utils/genUtils";
import { getCusEntHoverTexts } from "@/views/admin/adminUtils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useCustomerContext } from "../../customer/CustomerContext";

export function BalanceSelectionSheet() {
	const { customer } = useCusQuery();
	const { entityId } = useCustomerContext();
	const {
		featureId,
		originalEntitlements,
		setSheet: setBalanceSheet,
	} = useCustomerBalanceSheetStore();
	const setSheet = useSheetStore((s) => s.setSheet);

	if (!featureId || !originalEntitlements.length) {
		return (
			<div className="flex flex-col h-full">
				<SheetHeader
					title="Select Balance"
					description="Loading balance information..."
				/>
			</div>
		);
	}

	const firstEnt = originalEntitlements[0];
	const feature = firstEnt.entitlement.feature;

	const handleSelectBalance = (cusEntId: string) => {
		setBalanceSheet({
			type: "edit-balance",
			featureId,
			originalEntitlements,
			selectedCusEntId: cusEntId,
		});
		setSheet({ type: "balance-edit" });
	};

	return (
		<div className="flex flex-col h-full">
			<SheetHeader
				title="Balance List"
				description={
					<CopyButton text={feature.id} size="sm" innerClassName="font-mono">
						{feature.name}
					</CopyButton>
				}
			/>

			<div className="flex-1 overflow-y-auto">
				<SheetSection withSeparator={false}>
					<div className="flex flex-col gap-3">
						{originalEntitlements.map((cusEnt) => {
							const cusProduct = cusEnt.customer_product;
							const balance = getCusEntBalance({
								cusEnt,
								entityId,
							}).balance;

							// For loose entitlements (no customer_product), check cusEnt.internal_entity_id
							// For product entitlements, check cusProduct.internal_entity_id/entity_id
							const entity = customer?.entities?.find((e: Entity) => {
								// Check for entity-level loose entitlement
								if (cusEnt.internal_entity_id) {
									return e.internal_id === cusEnt.internal_entity_id;
								}
								// Check for entity-level product entitlement
								return (
									e.internal_id === cusProduct?.internal_entity_id ||
									e.id === cusProduct?.entity_id
								);
							});

							const entitlement = cusEnt.entitlement;
							const isConsumable =
								entitlement.feature.type === FeatureType.CreditSystem ||
								(entitlement.feature.type === FeatureType.Metered &&
									entitlement.feature.config?.usage_type === "single_use");

							const getIntervalDisplay = () => {
								if (!entitlement.interval) return "Lifetime";
								if (entitlement.interval === EntInterval.Lifetime)
									return "Lifetime";

								const count = entitlement.interval_count || 1;
								if (count > 1) {
									return `${count} ${entitlement.interval}s`;
								}
								return entitlement.interval;
							};

							const rolloversExist = cusEnt.rollovers.length > 0;

							const rolloverBalance = cusEnt.rollovers.reduce(
								(acc, rollover) => acc + rollover.balance,
								0,
							);

							return (
								<Button
									variant="secondary"
									key={cusEnt.id}
									onClick={() => handleSelectBalance(cusEnt.id)}
									className="flex justify-between p-3! px-4! text-left h-fit! w-full items-start"
								>
									<div className="flex flex-col gap-2">
										{entity && (
											<InfoRow
												label="Entity"
												value={entity.name || entity.id}
											/>
										)}
										<InfoRow
											label="Plan"
											value={
												<AdminHover
													texts={getCusEntHoverTexts({
														cusEnt,
														entities: customer?.entities || [],
													})}
												>
													<span>{cusProduct?.product.name || "N/A"}</span>
												</AdminHover>
											}
										/>

										{isConsumable && (
											<InfoRow
												label="Interval"
												value={
													<span className="bg-muted px-1 py-0.5 rounded-md text-t3">
														{getIntervalDisplay()}
													</span>
												}
											/>
										)}
										<InfoRow
											label="Created"
											value={`${
												formatUnixToDateTime(cusEnt.created_at, {
													withYear: true,
												}).date
											}, ${formatUnixToDateTime(cusEnt.created_at).time}`}
										/>
										{cusEnt.expires_at && (
											<InfoRow
												label="Expires At"
												value={`${
													formatUnixToDateTime(cusEnt.expires_at, {
														withYear: true,
													}).date
												}, ${formatUnixToDateTime(cusEnt.expires_at).time}`}
											/>
										)}
									</div>

									<div className="bg-muted px-1 py-0.5 rounded-md text-t1 w-fit flex items-center gap-1">
										{isUnlimitedCusEnt(cusEnt)
											? "Unlimited"
											: notNullish(balance)
												? new Intl.NumberFormat().format(balance)
												: "N/A"}
										{rolloversExist && (
											<span className="flex items-center gap-1">
												+ {new Intl.NumberFormat().format(rolloverBalance)}
												<InfoTooltip>
													Rollover balance that has accumulated from previous
													periods. <br />
													This balance will be consumed first.
												</InfoTooltip>
											</span>
										)}
									</div>
								</Button>
							);
						})}
					</div>
				</SheetSection>
			</div>
		</div>
	);
}
