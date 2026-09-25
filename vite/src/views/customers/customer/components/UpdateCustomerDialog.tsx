import type { Customer } from "@autumn/shared";
import {
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	SmallSpinner,
} from "@autumn/ui";
import { useParams } from "react-router";
import { useCusBillingDetailsQuery } from "../hooks/useCusBillingDetailsQuery";
import { UpdateCustomerForm } from "./updateCustomer/UpdateCustomerForm";

const UpdateCustomerDialog = ({
	selectedCustomer,
	setOpen,
}: {
	selectedCustomer: Customer;
	setOpen: (open: boolean) => void;
}) => {
	const { customer_id } = useParams();
	const {
		data: billingDetails,
		isLoading,
		error,
	} = useCusBillingDetailsQuery({
		customerId: customer_id,
		enabled: !!selectedCustomer.processor?.id,
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
					billingDetails={billingDetails}
					billingDetailsError={error}
					onSaved={() => setOpen(false)}
				/>
			)}
		</DialogContent>
	);
};

export default UpdateCustomerDialog;
