import { useCustomerContext } from "@/views/customers2/customer/CustomerContext";
import { useCustomerLicenseActions } from "./useCustomerLicenseActions";

/**
 * Pools + assign/unassign for the customer page's selected entity, resolving
 * the URL's entity_id (which may hold the internal id, e.g. via the plans
 * table's Scope column) to the public id the licenses API expects.
 */
export const useCustomerLicenseBalances = ({
	enabled,
}: {
	/** Defaults to fetching only when an entity is selected. */
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
