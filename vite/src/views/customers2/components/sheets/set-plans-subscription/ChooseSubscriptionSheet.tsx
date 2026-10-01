import type { FullCustomer } from "@autumn/shared";
import { Button, SmallSpinner } from "@autumn/ui";
import { useEffect, useMemo, useState } from "react";
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
import { findUnlinkedFreePlanNames } from "./utils/findUnlinkedFreePlanNames";

const MAX_ROWS_WITHOUT_CHOICE = 1;

const customerDisplayName = (customer: FullCustomer | undefined) =>
	customer?.name || customer?.email || customer?.id || "This customer";

export function ChooseSubscriptionSheet() {
	const { customer } = useCusQuery();
	const fullCustomer = customer as FullCustomer | undefined;
	const setSheet = useSheetStore((state) => state.setSheet);
	const closeSheet = useSheetStore((state) => state.closeSheet);
	const sheetData = useSheetStore((state) => state.data);
	const [pickedKey, setPickedKey] = useState(
		() => (sheetData?.selectedKey as string | undefined) ?? null,
	);

	const { proposals, isLoading, error } = useSyncProposalsV2({
		customerId: fullCustomer?.id ?? "",
	});

	const customerProducts = fullCustomer?.customer_products;
	const rows = useMemo(
		() =>
			buildSubscriptionPickerRows({
				proposals,
				customerProducts: customerProducts ?? [],
				entities: fullCustomer?.entities ?? [],
			}),
		[proposals, customerProducts, fullCustomer?.entities],
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

	const editSelectedSubscription = () => {
		if (!selectedRow) return;
		setSheet({
			type: "create-schedule",
			data: {
				subscriptionTarget: subscriptionPickerRowToTarget({ row: selectedRow }),
			},
		});
	};

	const description = isLoading
		? "Loading Stripe subscriptions…"
		: `${customerDisplayName(fullCustomer)} has ${rows.length} Stripe subscriptions. Choose the one to edit.`;

	return (
		<div className="flex h-full flex-col">
			<SheetHeader title="Set Plans" description={description} />

			<div className="flex-1 overflow-y-auto p-4">
				{isLoading && (
					<div className="flex items-center justify-center py-12">
						<SmallSpinner size={20} className="text-tertiary-foreground" />
					</div>
				)}
				{Boolean(error) && (
					<p className="py-4 text-sm text-red-500">
						Failed to load Stripe subscriptions.
					</p>
				)}
				{!isLoading && !error && rows.length > MAX_ROWS_WITHOUT_CHOICE && (
					<>
						<SubscriptionPickerTable
							rows={rows}
							selectedKey={selectedRow?.key ?? null}
							onSelect={setPickedKey}
						/>
						{freePlanNames.length > 0 && (
							<p className="px-1 pt-2 text-xs text-tertiary-foreground">
								Free plans ({freePlanNames.join(", ")}) are included with
								whichever subscription you edit.
							</p>
						)}
					</>
				)}
			</div>

			<SheetFooter className="border-t border-border pt-4">
				<Button variant="secondary" onClick={closeSheet} className="w-full">
					Cancel
				</Button>
				<Button
					variant="primary"
					onClick={editSelectedSubscription}
					disabled={!selectedRow || hasNothingToChoose}
					className="w-full"
				>
					Edit subscription
				</Button>
			</SheetFooter>
		</div>
	);
}
