import {
	Pagination,
	PaginationContent,
	PaginationItem,
	PaginationNext,
	PaginationPrevious,
} from "@/components/ui/pagination";
import { useCustomersQueryStates } from "../../hooks/useCustomersQueryStates";
import { CustomersSearchBar } from "../CustomersSearchBar";
import CustomersFilterButton from "../filter-dropdown/CustomersFilterButton";
import { useCusSearchQuery } from "../../hooks/useCusSearchQuery";
import CreateCustomer from "../CreateCustomer";
import { CustomersPagination } from "../CustomersPagination";

export const CustomersTopBar = () => {
	const { queryStates, setQueryStates } = useCustomersQueryStates();
	const { totalCount } = useCusSearchQuery();

	return (
		<div className="flex w-full justify-between sticky top-0 z-10 border-y  pl-10 pr-7 items-center bg-stone-100 h-10">
			<div className="flex items-center">
				<div className="pr-4 flex items-center justify-center gap-2 h-10">
					<CustomersFilterButton />
				</div>

				<CustomersSearchBar />
				<CustomersPagination />
				<div className="pl-4">
					<p className="text-t2 px-1 rounded-md bg-stone-200 text-sm">
						{totalCount}
					</p>
				</div>
			</div>
			<div className="flex gap-4 bg-blue-100">
				<CreateCustomer />
			</div>
		</div>
	);
};
