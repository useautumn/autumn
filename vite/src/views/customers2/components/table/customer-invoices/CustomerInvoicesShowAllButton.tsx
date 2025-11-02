import { ArrowRightIcon } from "@phosphor-icons/react";
import { useNavigate } from "react-router";
import { Button } from "@/components/v2/buttons/Button";
import { useCustomerContext } from "@/views/customers2/customer/CustomerContext";

export function CustomerInvoicesShowAllButton() {
	const navigate = useNavigate();
	const { customer } = useCustomerContext();
	return (
		<Button
			variant="skeleton"
			size="mini"
			onClick={() => {
				navigate(`/customers/${customer.id}/invoices`);
			}}
		>
			Show all
			<ArrowRightIcon size={12} />
		</Button>
	);
}
