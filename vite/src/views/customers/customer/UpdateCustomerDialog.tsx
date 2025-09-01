import type { CreateCustomer, Customer, Reward } from "@autumn/shared";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	DialogContent,
	DialogFooter,
	DialogTitle,
} from "@/components/ui/dialog";
import { CusService } from "@/services/customers/CusService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import { getBackendErr, navigateTo } from "@/utils/genUtils";
import { CustomerConfig } from "./CustomerConfig";
import { useCustomerContext } from "./CustomerContext";

const UpdateCustomerDialog = ({
	selectedCustomer,
	open,
	setOpen,
}: {
	selectedCustomer: Customer;
	open: boolean;
	setOpen: (open: boolean) => void;
}) => {
	const { cusMutate } = useCustomerContext();
	const [_couponSelected, _setCouponSelected] = useState<Reward | null>(null);
	const [customer, setCustomer] = useState<CreateCustomer>(selectedCustomer);
	const [loading, setLoading] = useState(false);
	const env = useEnv();
	const axiosInstance = useAxiosInstance({ env });
	const navigate = useNavigate();

	useEffect(() => {
		setCustomer(selectedCustomer);
	}, [selectedCustomer]);

	const handleAddClicked = async () => {
		try {
			setLoading(true);
			await CusService.updateCustomer({
				axios: axiosInstance,
				customer_id: selectedCustomer.id || selectedCustomer.internal_id,
				data: {
					id: customer.id || undefined,
					name: customer.name || null,
					email: customer.email || null,
					fingerprint: customer.fingerprint || null,
				},
			});

			toast.success(`Successfully updated customer`);
			setOpen(false);
			await cusMutate();

			if (customer.id !== selectedCustomer.id) {
				navigateTo(`/customers/${customer.id}`, navigate, env);
			}
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to update customer"));
		} finally {
			setLoading(false);
		}
	};

	return (
		<DialogContent className="w-md">
			<DialogTitle>Update Customer</DialogTitle>

			<CustomerConfig
				customer={customer}
				setCustomer={setCustomer}
				isUpdate={true}
			/>

			<DialogFooter>
				<Button
					variant="gradientPrimary"
					onClick={() => handleAddClicked()}
					isLoading={loading}
				>
					Update
				</Button>
			</DialogFooter>
		</DialogContent>
	);
};

export default UpdateCustomerDialog;
