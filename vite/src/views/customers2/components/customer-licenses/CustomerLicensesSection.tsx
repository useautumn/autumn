import { LicenseSectionTag } from "@/components/v2/icons/LicenseSectionTag";
import { useCustomerContext } from "@/views/customers2/customer/CustomerContext";
import { CustomerLicenseRow } from "./CustomerLicenseRow";
import { useCustomerLicenseActions } from "./useCustomerLicenseActions";

export function CustomerLicensesSection() {
	const { customer, entityId } = useCustomerContext();
	const customerId = customer.id ?? customer.internal_id;

	const {
		pools,
		isLoading,
		assignLicense,
		unassignLicense,
		pendingPoolId,
		isAssigning,
		isUnassigning,
	} = useCustomerLicenseActions({
		customerId,
		entityId: entityId ?? undefined,
	});

	if (!entityId || isLoading || pools.length === 0) return null;

	return (
		<div className="flex flex-col gap-2">
			<LicenseSectionTag />
			<div className="flex flex-col gap-1">
				{pools.map((pool) => {
					const isRowPending = pendingPoolId === pool.pool_id;
					return (
						<CustomerLicenseRow
							key={pool.pool_id}
							pool={pool}
							entityId={entityId}
							onAssign={() => assignLicense(pool)}
							onUnassign={(assignmentId) =>
								unassignLicense({ pool, assignmentId })
							}
							isAssigning={isAssigning && isRowPending}
							isUnassigning={isUnassigning && isRowPending}
						/>
					);
				})}
			</div>
		</div>
	);
}
