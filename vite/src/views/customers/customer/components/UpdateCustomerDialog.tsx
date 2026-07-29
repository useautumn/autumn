import type { CreateCustomer, Customer } from "@autumn/shared";
import {
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	FormLabel as FieldLabel,
	Input,
	ShortcutButton,
} from "@autumn/ui";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { CusService } from "@/services/customers/CusService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import { getBackendErr, navigateTo } from "@/utils/genUtils";
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";
import { useCusQuery } from "../hooks/useCusQuery";
import { CustomerConfig } from "./CustomerConfig";

const UpdateCustomerDialog = ({
	selectedCustomer,
	setOpen,
}: {
	selectedCustomer: Customer;
	open: boolean;
	setOpen: (open: boolean) => void;
}) => {
	const { customer: curCustomer, refetch } = useCusQuery();
	const [customer, setCustomer] = useState<CreateCustomer>(curCustomer);
	const [stripeId, setStripeId] = useState(
		selectedCustomer.processor?.id ?? "",
	);

	const [loading, setLoading] = useState(false);
	const env = useEnv();
	const axiosInstance = useAxiosInstance({ env });
	const navigate = useNavigate();

	const stripeIdChanged = stripeId !== (selectedCustomer.processor?.id ?? "");

	const handleAddClicked = async () => {
		try {
			setLoading(true);

			const data: Record<string, unknown> = {
				id: customer.id || undefined,
				name: customer.name || null,
				email: customer.email || null,
				fingerprint: customer.fingerprint || null,
			};

			if (stripeIdChanged) {
				data.stripe_id = stripeId || null;
			}

			await CusService.updateCustomer({
				axios: axiosInstance,
				customer_id: selectedCustomer.id || selectedCustomer.internal_id,
				data,
			});

			toast.success("Successfully updated customer");
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
			<DialogHeader>
				<DialogTitle>Update Customer</DialogTitle>
				<DialogDescription>
					Edit customer details and billing configuration.
				</DialogDescription>
			</DialogHeader>

			<CustomerConfig
				customer={customer}
				setCustomer={setCustomer}
				isUpdate={true}
			/>

			<div>
				<FieldLabel>Stripe Customer ID</FieldLabel>
				<Input
					value={stripeId}
					onChange={(e) => setStripeId(e.target.value)}
					placeholder="cus_..."
				/>
			</div>

			{stripeIdChanged && (
				<InfoBox variant="warning">
					Changing the Stripe Customer ID will break existing subscription
					links. You can sync from Stripe again after updating (Actions → Sync
					from Stripe).
				</InfoBox>
			)}

			<DialogFooter>
				<ShortcutButton
					variant="primary"
					onClick={() => handleAddClicked()}
					isLoading={loading}
					metaShortcut="enter"
					className="w-full"
				>
					Update Customer
				</ShortcutButton>
			</DialogFooter>
		</DialogContent>
	);
};

export default UpdateCustomerDialog;
