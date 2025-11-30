import type { CreateCustomer, Customer } from "@autumn/shared";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/v2/buttons/Button";
import {
	DialogContent,
	DialogFooter,
	DialogTitle,
} from "@/components/v2/dialogs/Dialog";
import { CusService } from "@/services/customers/CusService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import { getBackendErr, navigateTo } from "@/utils/genUtils";
import { useCusQuery } from "../hooks/useCusQuery";
import { CustomerConfig } from "./CustomerConfig";

const UpdateCustomerDialog = ({
	selectedCustomer,
	open,
	setOpen,
}: {
	selectedCustomer: Customer;
	open: boolean;
	setOpen: (open: boolean) => void;
}) => {
	// const { cusMutate } = useCustomerContext();
	const { customer: curCustomer, refetch } = useCusQuery();
	const [customer, setCustomer] = useState<CreateCustomer>(curCustomer);

	const [loading, setLoading] = useState(false);
	const env = useEnv();
	const axiosInstance = useAxiosInstance({ env });
	const navigate = useNavigate();

	// useEffect(() => {
	//   setCustomer(selectedCustomer);
	// }, [open]);

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
			await refetch();

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
		<DialogContent className="w-md bg-card">
			<DialogTitle>Update Customer</DialogTitle>

			<CustomerConfig
				customer={customer}
				setCustomer={setCustomer}
				isUpdate={true}
			/>

			<DialogFooter>
				<Button
					variant="primary"
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
