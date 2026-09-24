import type { Customer } from "@autumn/shared";
import {
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	SmallSpinner,
} from "@autumn/ui";
import { useParams } from "react-router";
import { useCustomerObjectQuery } from "@/views/customers2/customer/hooks/useCustomerObjectQuery";
import { UpdateCustomerForm } from "./updateCustomer/UpdateCustomerForm";

const UpdateCustomerDialog = ({
	selectedCustomer,
	setOpen,
}: {
	selectedCustomer: Customer;
	setOpen: (open: boolean) => void;
}) => {
	const { customer_id } = useParams();
	const { data: customerObject, isLoading } = useCustomerObjectQuery({
		customerId: customer_id,
		scopeEntityId: null,
		enabled: true,
	});

	return (
		<DialogContent className="w-md bg-card max-h-[90vh] overflow-y-auto">
			<DialogHeader>
				<DialogTitle>Update Customer</DialogTitle>
				<DialogDescription>
					Edit customer details and billing configuration.
				</DialogDescription>
			</DialogHeader>

			{isLoading ? (
				<SmallSpinner />
			) : (
				<UpdateCustomerForm
					customer={selectedCustomer}
					billingDetails={customerObject?.billing_details}
					onSaved={() => setOpen(false)}
				/>
			)}
		</DialogContent>
	);
};

export default UpdateCustomerDialog;
