import type { FullCustomer } from "@autumn/shared";
import { Alert, AlertDescription, Button } from "@autumn/ui";
import { InfoIcon } from "@phosphor-icons/react";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
	SheetFooter,
	SheetHeader,
} from "@/components/v2/sheets/SharedSheetComponents";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useSyncProposalsV2 } from "@/views/customers2/components/sync-stripe-v2/hooks/useSyncProposalsV2";
import { SubscriptionPickerTable } from "./SubscriptionPickerTable";
import {
	buildSubscriptionPickerRows,
	subscriptionPickerRowToTarget,
} from "./utils/buildSubscriptionPickerRows";
import { editSubscriptionLabel } from "./utils/editSubscriptionLabel";
import { findUnlinkedFreePlanNames } from "./utils/findUnlinkedFreePlanNames";

const MAX_ROWS_WITHOUT_CHOICE = 1;

export function ChooseSubscriptionSheet() {
	const { customer } = useCusQuery();
	const fullCustomer = customer as FullCustomer | undefined;
	const setSheet = useSheetStore((state) => state.setSheet);
	const closeSheet = useSheetStore((state) => state.closeSheet);
	const sheetData = useSheetStore((state) => state.data);
	const [pickedKey, setPickedKey] = useState(
		() => (sheetData?.selectedKey as string | undefined) ?? null,
	);
	const openKey = sheetData?.openKey as string | undefined;

	const { proposals, isLoading, error } = useSyncProposalsV2({
		customerId: fullCustomer?.id ?? "",
	});

	const customerProducts = fullCustomer?.customer_products;
	const rows = useMemo(
		() =>
			buildSubscriptionPickerRows({
				proposals: isLoading || error ? undefined : proposals,
				customerProducts: customerProducts ?? [],
				entities: fullCustomer?.entities ?? [],
			}),
		[isLoading, error, proposals, customerProducts, fullCustomer?.entities],
	);
	const freePlanNames = useMemo(
		() =>
			findUnlinkedFreePlanNames({ customerProducts: customerProducts ?? [] }),
		[customerProducts],
	);

	const selectedRow =
		rows.find((row) => row.key === pickedKey) ?? rows[0] ?? null;
	const hasNothingToChoose =
		!isLoading && !error && rows.length <= MAX_ROWS_WITHOUT_CHOICE;

	useEffect(() => {
		if (hasNothingToChoose) setSheet({ type: "create-schedule" });
	}, [hasNothingToChoose, setSheet]);

	const rowToOpen = openKey ? rows.find((row) => row.key === openKey) : null;
	useLayoutEffect(() => {
		if (!rowToOpen) return;
		setSheet({
			type: "create-schedule",
			data: {
				subscriptionTarget: subscriptionPickerRowToTarget({ row: rowToOpen }),
			},
		});
	}, [rowToOpen, setSheet]);

	const editSelectedSubscription = () => {
		if (!selectedRow) return;
		setSheet({
			type: "create-schedule",
			data: {
				subscriptionTarget: subscriptionPickerRowToTarget({ row: selectedRow }),
			},
		});
	};

	const description =
		"Set Plans edits one Stripe subscription at a time. Plans on the others stay as they are.";

	if (rowToOpen) return null;

	return (
		<div className="flex h-full flex-col">
			<SheetHeader title="Choose a subscription" description={description} />

			<div className="min-h-0 overflow-y-auto px-4 pt-4">
				{rows.length > MAX_ROWS_WITHOUT_CHOICE && (
					<>
						{freePlanNames.length > 0 && (
							<Alert className="mb-3">
								<InfoIcon weight="fill" />
								<AlertDescription>
									Free plans ({freePlanNames.join(", ")}) can be updated under
									any subscription. Changes apply to the whole customer.
								</AlertDescription>
							</Alert>
						)}
						<SubscriptionPickerTable
							rows={rows}
							isLoadingStripe={isLoading}
							selectedKey={selectedRow?.key ?? null}
							onSelect={setPickedKey}
						/>
						{Boolean(error) && (
							<p className="px-1 pt-2 text-xs text-red-500">
								Couldn't load Stripe statuses. You can still pick a
								subscription.
							</p>
						)}
					</>
				)}
			</div>

			<SheetFooter className="pt-4">
				<Button variant="secondary" onClick={closeSheet} className="w-full">
					Cancel
				</Button>
				<Button
					variant="primary"
					onClick={editSelectedSubscription}
					disabled={!selectedRow || hasNothingToChoose}
					className="w-full min-w-0"
				>
					<span className="truncate">
						{editSubscriptionLabel({ planNames: selectedRow?.planNames ?? [] })}
					</span>
				</Button>
			</SheetFooter>
		</div>
	);
}
