import {
	DialogTrigger,
	DialogTitle,
	DialogHeader,
	DialogFooter,
} from "@/components/ui/dialog";
import { DialogContent } from "@/components/ui/dialog";
import { Dialog } from "@/components/ui/dialog";
import { FullCusProduct, FullCustomerEntitlement } from "@autumn/shared";
import { useEffect, useState } from "react";
import { useCustomerContext } from "../CustomerContext";
import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { Input } from "@/components/ui/input";

import { Button } from "@/components/ui/button";

import { DateInputUnix } from "@/components/general/DateInputUnix";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { CusService } from "@/services/customers/CusService";
import { toast } from "sonner";
import { getBackendErr, notNullish } from "@/utils/genUtils";
import CopyButton from "@/components/general/CopyButton";
import { AlertCircle, Info, InfoIcon } from "lucide-react";
import { useCusQuery } from "../hooks/useCusQuery";
import { getCusEntBalance } from "@autumn/shared";

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

	console.log(
		"Balance: ",
		cusEnt
			? getCusEntBalance({
					cusEnt: cusEnt!,
					entityId,
				}).balance
			: null,
	);

	const [updateLoading, setUpdateLoading] = useState(false);
	const axiosInstance = useAxiosInstance();

	console.log(
		`Cus ent: ${cusEnt?.entitlement.feature_id}, Balances: `,
		cusEnt
			? getCusEntBalance({
					cusEnt: cusEnt!,
					entityId,
				})
			: null,
	);

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
		setUpdateFields({
			balance: cusEnt
				? getCusEntBalance({
						cusEnt: cusEnt!,
						entityId,
					}).balance
				: null,
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

		if (cusPrice && updateFields.next_reset_at != cusEnt.next_reset_at) {
			toast.error(`Not allowed to change reset at for paid features`);
			return;
		}

		setUpdateLoading(true);
		try {
			await CusService.updateCusEntitlement(
				axiosInstance,
				customer.id || customer.internal_id,
				cusEnt.id,
				{
					balance: balanceInt,
					next_reset_at: updateFields.next_reset_at,
					entity_id: entityId,
				},
			);
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
