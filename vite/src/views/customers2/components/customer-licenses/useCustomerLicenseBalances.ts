import { useCustomerContext } from "@/views/customers2/customer/CustomerContext";
import { useCustomerLicenseActions } from "./useCustomerLicenseActions";

export const useCustomerLicenseBalances = ({
	enabled,
}: {
	enabled?: boolean;
} = {}) => {
	const { customer, entityId } = useCustomerContext();
	const customerId = customer.id ?? customer.internal_id;

	const publicEntityId =
		customer.entities?.find(
			(entity) => entity.id === entityId || entity.internal_id === entityId,
		)?.id ??
		entityId ??
		undefined;

	return {
		publicEntityId,
		...useCustomerLicenseActions({
			customerId,
			entityId: publicEntityId,
			enabled,
		}),
	};
};
