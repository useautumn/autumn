import type { Customer } from "@autumn/shared";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/v2/buttons/Button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/v2/dialogs/Dialog";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import { navigateTo } from "@/utils/genUtils";
import { useCusSearchQuery } from "../../hooks/useCusSearchQuery";

export const DeleteCustomerDialog = ({
	customer,
	open,
	setOpen,
	redirectToCustomersPage: redirect = false,
}: {
	customer: Customer;
	open: boolean;
	setOpen: (open: boolean) => void;
	redirectToCustomersPage?: boolean;
}) => {
	const [loadingStates, setLoadingStates] = useState({
		deleteStripe: false,
		deleteCustomer: false,
	});
	const { refetch } = useCusSearchQuery();
	const navigate = useNavigate();
	const axiosInstance = useAxiosInstance();
	const env = useEnv();

	const handleClicked = async ({
		deleteStripe = false,
	}: {
		deleteStripe?: boolean;
	}) => {
		setLoadingStates({
			deleteStripe: deleteStripe,
			deleteCustomer: !deleteStripe,
		});

		try {
			await axiosInstance.delete(
				`/v1/customers/${customer.id || customer.internal_id}?delete_in_stripe=${deleteStripe}`,
			);

			await refetch();
			setOpen(false);
			toast.success("Customer deleted");
			if (redirect) {
				navigateTo(`/customers`, navigate, env);
			}
		} catch (error) {
			toast.error("Failed to delete customer");
		} finally {
			setLoadingStates({
				deleteStripe: false,
				deleteCustomer: false,
			});
			setOpen(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent className="w-md" onClick={(e) => e.stopPropagation()}>
				<DialogHeader>
					<DialogTitle>Delete Customer</DialogTitle>
				</DialogHeader>

				<div className="mb-2 text-sm">
					<p className="text-t2">
						Are you sure you want to delete this customer in Autumn? This action
						cannot be undone. Select whether to delete this customer in Stripe
						as well.
					</p>
				</div>

				<DialogFooter>
					<div className="flex gap-2">
						<Button
							variant="secondary"
							className="cursor-pointer"
							onClick={() => handleClicked({ deleteStripe: false })}
							isLoading={loadingStates.deleteCustomer}
							disabled={loadingStates.deleteStripe}
						>
							Delete in Autumn only
						</Button>
						<Button
							variant="destructive"
							className="cursor-pointer"
							onClick={() => handleClicked({ deleteStripe: true })}
							isLoading={loadingStates.deleteStripe}
							disabled={loadingStates.deleteCustomer}
						>
							Delete in Autumn and Stripe
						</Button>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
