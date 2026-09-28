import type { ApiBillingDetails, Customer } from "@autumn/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { useAppForm } from "@/hooks/form/form";
import { CusService } from "@/services/customers/CusService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import { getBackendErr, navigateTo } from "@/utils/genUtils";
import {
	customerToFormValues,
	formValuesToCustomerPatch,
	formValuesToUpdateCustomerBody,
	type UpdateCustomerFormValues,
} from "./updateCustomerFormValues";

const CUSTOMER_QUERY_KEYS = [
	"customer",
	"customer-object",
	"customer_billing_details",
	"full_customers",
	"customers",
] as const;

export const useUpdateCustomerForm = ({
	customer,
	billingDetails,
	onSaved,
}: {
	customer: Customer;
	billingDetails: ApiBillingDetails | null | undefined;
	onSaved: () => void;
}) => {
	const env = useEnv();
	const axiosInstance = useAxiosInstance({ env });
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const { customer_id: routeCustomerId } = useParams();
	const initialValues = customerToFormValues({ customer, billingDetails });

	const updateCustomer = useMutation({
		mutationFn: (values: UpdateCustomerFormValues) =>
			CusService.updateCustomer({
				axios: axiosInstance,
				customer_id: customer.id || customer.internal_id,
				data: formValuesToUpdateCustomerBody({
					initial: initialValues,
					values,
				}),
			}),
		onSuccess: (_, values) => {
			toast.success("Successfully updated customer");
			onSaved();
			queryClient.setQueriesData<{ customer?: Customer }>(
				{ queryKey: ["customer", routeCustomerId] },
				(data) =>
					data?.customer
						? {
								...data,
								customer: {
									...data.customer,
									...formValuesToCustomerPatch(values),
								},
							}
						: data,
			);
			for (const key of CUSTOMER_QUERY_KEYS) {
				queryClient.invalidateQueries({ queryKey: [key] });
			}
			if (values.id && values.id !== customer.id) {
				navigateTo(`/customers/${values.id}`, navigate, env);
			}
		},
		onError: (error) =>
			toast.error(getBackendErr(error, "Failed to update customer")),
	});

	const form = useAppForm({
		defaultValues: initialValues,
		onSubmit: ({ value }) => updateCustomer.mutate(value),
	});

	return { form, initialValues, isSaving: updateCustomer.isPending };
};

export type UpdateCustomerForm = ReturnType<
	typeof useUpdateCustomerForm
>["form"];
