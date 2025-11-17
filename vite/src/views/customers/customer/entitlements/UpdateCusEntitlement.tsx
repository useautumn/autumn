import {
	type FullCusProduct,
	type FullCustomerEntitlement,
	getCusEntBalance,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import { AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import CopyButton from "@/components/general/CopyButton";
import { DateInputUnix } from "@/components/general/DateInputUnix";
import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr, notNullish } from "@/utils/genUtils";
import { useCustomerContext } from "../CustomerContext";
import { useCusQuery } from "../hooks/useCusQuery";

function UpdateCusEntitlement({
	selectedCusEntitlement,
	setSelectedCusEntitlement,
}: {
	selectedCusEntitlement: FullCustomerEntitlement | null;
	setSelectedCusEntitlement: (cusEnt: FullCustomerEntitlement | null) => void;
}) {
	const { customer, refetch } = useCusQuery();
	const { entityId } = useCustomerContext();

	const cusEnt = selectedCusEntitlement;

	const [updateLoading, setUpdateLoading] = useState(false);
	const axiosInstance = useAxiosInstance();

	const [updateFields, setUpdateFields] = useState<any>({
		balance: cusEnt
			? getCusEntBalance({
					cusEnt,
					entityId,
				}).balance
			: null,

		next_reset_at: cusEnt?.next_reset_at,
	});

	const getCusProduct = (cusEnt: FullCustomerEntitlement) => {
		const cusProduct = customer.customer_products.find(
			(cp: FullCusProduct) => cp.id === cusEnt.customer_product_id,
		);
		return cusProduct;
	};

	useEffect(() => {
		if (!cusEnt) return;
		const { balance, additional_balance } = getCusEntBalance({
			cusEnt: cusEnt,
			entityId,
		});
		setUpdateFields({
			balance: new Decimal(balance).add(additional_balance).toNumber(),
			next_reset_at: cusEnt?.next_reset_at,
		});
	}, [selectedCusEntitlement]);

	if (!selectedCusEntitlement) return null;

	const entitlement = selectedCusEntitlement.entitlement;
	const feature = entitlement.feature;
	const cusProduct = getCusProduct(selectedCusEntitlement);

	const handleUpdateCusEntitlement = async (
		cusEnt: FullCustomerEntitlement,
	) => {
		const balanceInt = parseFloat(updateFields.balance);
		if (isNaN(balanceInt)) {
			toast.error("Balance not valid");
			return;
		}

		if (cusPrice && updateFields.next_reset_at !== cusEnt.next_reset_at) {
			toast.error(`Not allowed to change reset at for paid features`);
			return;
		}

		setUpdateLoading(true);
		try {
			await axiosInstance.post("/v1/balances/update", {
				customer_id: customer.id || customer.internal_id,
				feature_id: feature.id,
				current_balance: balanceInt,
				customer_entitlement_id: cusEnt.id,
				// usage: 0,
			});

			toast.success("Entitlement updated successfully");
			await refetch();
			setSelectedCusEntitlement(null);
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to update entitlement"));
		}
		setUpdateLoading(false);
	};

	const cusPrice = cusProduct?.customer_prices.find(
		(cp: any) => cp.price.entitlement_id === cusEnt?.entitlement.id,
	);

	return (
		<Dialog
			open={!!selectedCusEntitlement}
			onOpenChange={() => setSelectedCusEntitlement(null)}
		>
			<DialogTrigger asChild></DialogTrigger>
			<DialogContent className="min-w-sm">
				<DialogHeader>
					<div className="flex flex-col gap-4">
						<DialogTitle>{feature.name}</DialogTitle>
						<CopyButton text={feature.id} className="w-fit font-mono">
							{feature.id}
						</CopyButton>
					</div>
				</DialogHeader>
				<div className="flex flex-col gap-4">
					<div>
						<FieldLabel>Balance</FieldLabel>
						<Input
							type="number"
							value={
								notNullish(updateFields.balance) ? updateFields.balance : ""
							}
							onChange={(e) => {
								setUpdateFields({
									...updateFields,
									balance: e.target.value,
								});
							}}
						/>
					</div>
					<div>
						<FieldLabel
							description={
								cusPrice && (
									<span className="flex items-center gap-1 mt-1">
										<AlertCircle size={11} /> Can't update reset at for paid
										features
									</span>
								)
							}
						>
							Next Reset
						</FieldLabel>
						<DateInputUnix
							disabled={!!cusPrice}
							unixDate={updateFields.next_reset_at}
							setUnixDate={(unixDate) => {
								setUpdateFields({ ...updateFields, next_reset_at: unixDate });
							}}
						/>
					</div>
				</div>
				<DialogFooter>
					<Button
						variant="gradientPrimary"
						isLoading={updateLoading}
						onClick={() => handleUpdateCusEntitlement(selectedCusEntitlement)}
					>
						Update
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export default UpdateCusEntitlement;
