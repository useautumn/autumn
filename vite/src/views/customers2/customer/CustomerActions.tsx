import { PencilIcon, TrashIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "@/components/v2/buttons/Button";
import { Dialog } from "@/components/v2/dialogs/Dialog";
import { DeleteCustomerDialog } from "@/views/customers/customer/components/DeleteCustomerDialog";
import UpdateCustomerDialog from "@/views/customers/customer/components/UpdateCustomerDialog";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";

export function CustomerActions() {
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [deleteOpen, setDeleteOpen] = useState(false);
	const { customer } = useCusQuery();
	return (
		<div className="flex items-center gap-2">
			<Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
				<UpdateCustomerDialog
					selectedCustomer={customer}
					open={isModalOpen}
					setOpen={setIsModalOpen}
				/>
			</Dialog>
			<DeleteCustomerDialog
				customer={customer}
				open={deleteOpen}
				setOpen={setDeleteOpen}
				redirectToCustomersPage
			/>
			<Button
				size="mini"
				variant="secondary"
				onClick={() => setIsModalOpen(true)}
				className="gap-1"
			>
				<PencilIcon className="text-t3" />
				Customer details
			</Button>

			<Button
				size="icon"
				variant="secondary"
				onClick={() => setDeleteOpen(true)}
			>
				<TrashIcon className="text-t3" />
			</Button>
		</div>
	);
}
