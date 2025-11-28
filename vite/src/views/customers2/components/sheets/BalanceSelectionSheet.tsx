import {
	type FullCusProduct,
	type FullCustomerEntitlement,
	getCusEntBalance,
} from "@autumn/shared";
import { CopyButton } from "@/components/v2/buttons/CopyButton";
import { SheetHeader, SheetSection } from "@/components/v2/sheets/InlineSheet";
import { useCustomerBalanceSheetStore } from "@/hooks/stores/useCustomerBalanceSheetStore";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { notNullish } from "@/utils/genUtils";
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

	const getCusProduct = (cusEnt: FullCustomerEntitlement) => {
		const cusProduct = customer?.customer_products.find(
			(cp: FullCusProduct) => cp.id === cusEnt.customer_product_id,
		);
		return cusProduct;
	};

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
				title="Select Balance to Update"
				description={
					<CopyButton text={feature.id} size="sm" innerClassName="font-mono">
						{feature.name}
					</CopyButton>
				}
			/>

			<div className="flex-1 overflow-y-auto">
				<SheetSection withSeparator={false}>
					<div className="flex flex-col gap-3">
						{originalEntitlements.map((cusEnt: FullCustomerEntitlement) => {
							const cusProduct = getCusProduct(cusEnt);
							const balance = getCusEntBalance({
								cusEnt,
								entityId,
							}).balance;

							return (
								<button
									key={cusEnt.id}
									type="button"
									onClick={() => handleSelectBalance(cusEnt.id)}
									className="flex flex-col gap-2 bg-secondary p-3 rounded-lg border hover:border-border-hover hover:bg-muted transition-colors text-left"
								>
									{cusProduct?.name && (
										<div className="text-sm font-medium text-t1">
											{cusProduct.name}
										</div>
									)}
									<div className="flex flex-col gap-1.5">
										<div className="flex gap-2 items-center">
											<span className="text-t3 text-sm">Plan ID:</span>
											<span className="text-t1 text-sm font-mono truncate">
												{cusProduct?.product_id || "N/A"}
											</span>
										</div>
										{cusProduct?.entity_id && (
											<div className="flex gap-2 items-center">
												<span className="text-t3 text-sm">Entity ID:</span>
												<span className="text-t1 text-sm font-mono truncate">
													{cusProduct.entity_id}
												</span>
											</div>
										)}
										<div className="flex gap-2 items-center">
											<span className="text-t3 text-sm">Current Balance:</span>
											<span className="text-t1 text-sm font-medium">
												{notNullish(balance)
													? new Intl.NumberFormat().format(balance)
													: "N/A"}
											</span>
										</div>
									</div>
								</button>
							);
						})}
					</div>
				</SheetSection>
			</div>
		</div>
	);
}
