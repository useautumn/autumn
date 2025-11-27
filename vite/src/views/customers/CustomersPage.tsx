"use client";

import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import LoadingScreen from "../general/LoadingScreen";
import { CustomersContext } from "./CustomersContext";
import { CustomersTable } from "./components/CustomersTable";
import { CustomersTopBar } from "./components/customers-top-bar/CustomersTopBar";
import { useCusSearchQuery } from "./hooks/useCusSearchQuery";
import { useCustomersQueryStates } from "./hooks/useCustomersQueryStates";
import { useFullCusSearchQuery } from "./hooks/useFullCusSearchQuery";
import { useSavedViewsQuery } from "./hooks/useSavedViewsQuery";

function CustomersPage() {
	const { customers } = useCusSearchQuery();

	const { queryStates } = useCustomersQueryStates();

	const { isLoading: productsLoading } = useProductsQuery();

	useSavedViewsQuery();
	useFullCusSearchQuery();

	if (productsLoading) {
		return <LoadingScreen />;
	}

	return (
		<CustomersContext.Provider
			value={{
				customers,
			}}
		>
			<div className="flex flex-col gap-4 h-fit relative w-full ">
				<h1 className="text-xl font-medium shrink-0 pt-6 pl-10">Customers</h1>
				<div>
					<CustomersTopBar />
					{customers?.length && customers?.length > 0 ? (
						<div className="h-fit max-h-full">
							<CustomersTable customers={customers} />
						</div>
					) : (
						<div className="flex justify-start items-center h-10 text-t3 text-sm px-10">
							<span>
								{queryStates.q?.trim()
									? "No matching results found. Try a different search."
									: "Create your first customer by interacting with an Autumn function via the API."}
							</span>
						</div>
					)}
				</div>
			</div>
		</CustomersContext.Provider>
	);
}

export default CustomersPage;
