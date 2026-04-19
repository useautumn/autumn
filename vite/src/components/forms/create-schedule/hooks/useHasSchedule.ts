import { CusProductStatus } from "@autumn/shared";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";

export function useHasSchedule() {
	const { schedule, customer } = useCusQuery();
	return (
		!!schedule ||
		!!customer?.customer_products.some(
			(cp) => cp.status === CusProductStatus.Scheduled,
		)
	);
}
