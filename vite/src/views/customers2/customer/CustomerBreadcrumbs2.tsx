import type { Entity } from "@autumn/shared";
import { useNavigate } from "react-router";
import { AdminHover } from "@/components/general/AdminHover";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useEntity } from "@/hooks/stores/useSubscriptionStore";
import { useEnv } from "@/utils/envUtils";
import { navigateTo } from "@/utils/genUtils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";

export const CustomerBreadcrumbs = () => {
	const env = useEnv();
	const navigate = useNavigate();

	const { customer } = useCusQuery();
	const { entityId, setEntityId } = useEntity();

	const entity = customer.entities.find((e: Entity) => e.id === entityId);

	return (
		<Breadcrumb className="text-tertiary-foreground flex justify-start ">
			<BreadcrumbList className="text-tertiary-foreground text-xs">
				<BreadcrumbItem>
					<BreadcrumbLink
						className="cursor-pointer"
						onClick={() => navigateTo("/customers", navigate, env)}
					>
						<AdminHover
							texts={[
								{
									key: "Internal ID",
									value: customer.internal_id,
								},
								{
									key: "Stripe ID",
									value: customer.processor?.id,
								},
								...(() => {
									const ents = (customer.entities || []) as Entity[];
									if (ents.length === 0) return [];
									const shown = ents.slice(0, 3);
									const remaining = ents.length - shown.length;
									return [
										{ key: `Entities (${ents.length})`, value: shown[0].id },
										...shown.slice(1).map((e) => ({ key: "", value: e.id })),
										...(remaining > 0
											? [{ key: "", value: `+${remaining} more` }]
											: []),
									];
								})(),
							]}
						>
							Customers
						</AdminHover>
					</BreadcrumbLink>
				</BreadcrumbItem>
				<BreadcrumbSeparator />
				<BreadcrumbItem className="truncate max-w-36">
					{entityId ? (
						<BreadcrumbLink
							className="cursor-pointer"
							onClick={() => {
								setEntityId(null);
							}}
						>
							{customer.name || customer.id || customer.email}
						</BreadcrumbLink>
					) : (
						<span className="truncate">
							{customer.name || customer.id || customer.email}
						</span>
					)}
				</BreadcrumbItem>
				{entityId && (
					<>
						<BreadcrumbSeparator />
						<BreadcrumbItem className="truncate max-w-36">
							{entity?.name || entityId}
						</BreadcrumbItem>
					</>
				)}
			</BreadcrumbList>
		</Breadcrumb>
	);
};
