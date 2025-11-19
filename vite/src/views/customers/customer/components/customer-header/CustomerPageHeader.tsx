import { useCustomerContext } from "../../CustomerContext";
import { useCusQuery } from "../../hooks/useCusQuery";
import { CustomerBreadcrumbs } from "./CustomerBreadcrumbs";
import { SelectEntity } from "./SelectEntity";

export const CustomerPageHeader = () => {
	const { customer } = useCusQuery();
	const { entityId, setEntityId } = useCustomerContext();

	return (
		<div className="flex flex-col gap-2 pt-6">
			<CustomerBreadcrumbs />
			<div className="flex w-full justify-between pl-10 pr-7">
				<div className="flex gap-2 w-full">
					<h2 className="flex text-lg text-t1 font-medium w-full max-w-md justify-start truncate">
						{customer.name ? (
							<span className="truncate">{customer.name}</span>
						) : customer.id ? (
							<span className="truncate font-mono">{customer.id}</span>
						) : (
							<span className="truncate">{customer.email}</span>
						)}
					</h2>
				</div>

				<SelectEntity entityId={entityId || ""} entities={customer.entities} />
			</div>
		</div>
	);
};
