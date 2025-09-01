import type { FullCustomerEntitlement } from "@autumn/shared";
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
import { CusService } from "@/services/customers/CusService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr, notNullish } from "@/utils/genUtils";
import { useCustomerContext } from "../CustomerContext";

function UpdateCusEntitlement({
	selectedCusEntitlement,
	setSelectedCusEntitlement,
}: {
	selectedCusEntitlement: FullCustomerEntitlement | null;
	setSelectedCusEntitlement: (cusEnt: FullCustomerEntitlement | null) => void;
}) {
	// Get customer product
	const { customer, env, cusMutate, entityId } = useCustomerContext();
	const axiosInstance = useAxiosInstance({ env });

	const [updateLoading, setUpdateLoading] = useState(false);

	const cusEnt = selectedCusEntitlement;

	const [updateFields, setUpdateFields] = useState<any>({
		balance:
			entityId && notNullish(cusEnt?.entities?.[entityId]?.balance)
				? cusEnt?.entities?.[entityId]?.balance
				: cusEnt?.balance,
		next_reset_at: cusEnt?.next_reset_at,
	});

	const getCusProduct = (cusEnt: FullCustomerEntitlement) => {
		const cusProduct = customer.products.find(
			(p: any) => p.id === cusEnt.customer_product_id,
		);
		return cusProduct;
	};

	useEffect(() => {
		setUpdateFields({
			balance:
				entityId && notNullish(cusEnt?.entities?.[entityId]?.balance)
					? cusEnt?.entities?.[entityId]?.balance
					: cusEnt?.balance,
			next_reset_at: cusEnt?.next_reset_at,
		});
	}, [
		cusEnt?.balance,
		cusEnt?.entities?.[entityId]?.balance,
		cusEnt?.next_reset_at,
		entityId,
	]);

	if (!selectedCusEntitlement) return null;

	const entitlement = selectedCusEntitlement.entitlement;
	const feature = entitlement.feature;
	const cusProduct = getCusProduct(selectedCusEntitlement);

	const handleUpdateCusEntitlement = async (
		cusEnt: FullCustomerEntitlement,
	) => {
		const balanceInt = parseFloat(updateFields.balance);
		if (Number.isNaN(balanceInt)) {
			toast.error("Balance not valid");
			return;
		}

		if (cusPrice && updateFields.next_reset_at !== cusEnt.next_reset_at) {
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
			await cusMutate();
			setSelectedCusEntitlement(null);
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to update entitlement"));
		}
		setUpdateLoading(false);
	};

	const cusPrice = cusProduct?.customer_prices.find(
		(cp: any) => cp.price.entitlement_id === cusEnt?.entitlement.id,
	);
	console.log("Cus price:", cusPrice);
	console.log("Cus product:", cusProduct);

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

// const DateInput = ({
//   value,
//   onChange,
// }: {
//   value: string;
//   onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
// }) => {
//   const [date, setDate] = React.useState<Date>();

//   return (

//   );
// };
