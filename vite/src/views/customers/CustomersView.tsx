"use client";

import React, { useEffect, useRef } from "react";
import { AppEnv } from "@autumn/shared";
import { useAxiosPostSWR, useAxiosSWR } from "@/services/useAxiosSwr";
import { CustomersContext } from "./CustomersContext";
import { CustomersTable } from "./CustomersTable";
import {
	Pagination,
	PaginationContent,
	PaginationItem,
	PaginationNext,
	PaginationPrevious,
} from "@/components/ui/pagination";
import CreateCustomer from "./CreateCustomer";
import { SearchBar } from "./SearchBar";
import LoadingScreen from "../general/LoadingScreen";
import FilterButton from "./FilterButton";
import { SavedViewsDropdown } from "./SavedViewsDropdown";
import SmallSpinner from "@/components/general/SmallSpinner";
import {
	useQueryStates,
	parseAsString,
	parseAsInteger,
	parseAsJson,
	parseAsArrayOf,
} from "nuqs";

function CustomersView({ env }: { env: AppEnv }) {
	const pageSize = 50;

	const [queryStates, setQueryStates] = useQueryStates(
		{
			q: parseAsString.withDefault(""),
			status: parseAsString.withDefault(""),
			product_id: parseAsString.withDefault(""),
			version: parseAsString.withDefault(""),
			page: parseAsInteger.withDefault(1),
			lastItemId: parseAsString.withDefault(""),
		},
		{
			history: "push",
		}
	);

	const [searching, setSearching] = React.useState(false);
	const [paginationLoading, setPaginationLoading] = React.useState(false);

	const { data: productsData, isLoading: productsLoading } = useAxiosSWR({
		url: `/products/data`,
		env,
	});

	const { data: savedViewsData, mutate: mutateSavedViews } = useAxiosSWR({
		url: "/saved_views",
		env,
	});

	const { data, isLoading, error, mutate } = useAxiosPostSWR({
		url: `/v1/customers/all/search`,
		env,
		data: {
			search: queryStates.q || "",
			filters: {
				status: queryStates.status,
				product_id: queryStates.product_id,
				version: queryStates.version,
			},
			page: queryStates.page,
			page_size: pageSize,
			last_item: queryStates.lastItemId
				? { internal_id: queryStates.lastItemId }
				: null,
		},
	});

	const isFirstRender = useRef(true);
	const paginationFirstRender = useRef(true);
	const searchParamsChanged = useRef(false);
	const hasInitiallyLoaded = useRef(false);

	const resetPagination = () => {
		setQueryStates({
			page: 1,
			lastItemId: "",
		});
	};

	useEffect(() => {
		// Skip everything on the very first render
		if (isFirstRender.current) {
			isFirstRender.current = false;
			return;
		}

		// Mark that we've had at least one useEffect run after initial render
		if (!hasInitiallyLoaded.current) {
			hasInitiallyLoaded.current = true;
			// If this is a direct navigation to page > 1, don't reset pagination
			if (queryStates.page > 1) {
				return;
			}
		}

		// Only reset pagination for actual user filter changes
		searchParamsChanged.current = true;
		resetPagination();

		setPaginationLoading(true);
		mutate().finally(() => {
			setPaginationLoading(false);
		});
	}, [
		queryStates.q,
		queryStates.status,
		queryStates.product_id,
		queryStates.version,
	]);

	useEffect(() => {
		if (paginationFirstRender.current) {
			paginationFirstRender.current = false;
			return;
		}

		if (searchParamsChanged.current) {
			searchParamsChanged.current = false;
			return;
		}

		// For direct navigation, we just use whatever lastItemId is provided

		setPaginationLoading(true);
		mutate().finally(() => {
			setPaginationLoading(false);
		});
	}, [queryStates.page, queryStates.lastItemId]);

	const totalPages = Math.ceil((data?.totalCount || 0) / pageSize);

	if (isLoading || productsLoading) {
		return <LoadingScreen />;
	}

	const handleNextPage = async () => {
		if (totalPages == 0 || queryStates.page === totalPages) return;
		const lastItem = data?.customers[data?.customers.length - 1];

		setQueryStates({
			page: queryStates.page + 1,
			lastItemId: lastItem.internal_id, // This becomes the "cursor" for the next page
		});
	};

	const handlePreviousPage = async () => {
		if (queryStates.page === 1) return;
		// For previous page, we clear the lastItemId to force offset-based pagination
		setQueryStates({
			page: queryStates.page - 1,
			lastItemId: "",
		});
	};

	const handleFilterChange = (newFilters: any) => {
		const params: Record<string, string | number> = {
			page: 1,
			lastItemId: "",
		};

		if (newFilters?.status?.length > 0) {
			params.status = newFilters.status.join(",");
		} else {
			params.status = "";
		}

		// Handle new version-based filtering (productId:version format)
		if (newFilters?.version) {
			params.version = newFilters.version;
		} else {
			params.version = "";
		}

		// Legacy product_id support (keep for now)
		if (newFilters?.product_id?.length > 0) {
			params.product_id = newFilters.product_id.join(",");
		} else {
			params.product_id = "";
		}

		setQueryStates(params);
		mutate();
	};

	return (
		<CustomersContext.Provider
			value={{
				customers: data?.customers,
				env,
				mutate,
				filters: {
					status:
						queryStates.status?.split(",").filter(Boolean) || [],
					product_id:
						queryStates.product_id?.split(",").filter(Boolean) ||
						[],
					version: queryStates.version,
				},
				setFilters: handleFilterChange,
				products: productsData?.products,
				versionCounts: productsData?.versionCounts,
				setQueryStates,
				mutateSavedViews,
			}}
		>
			<div className="flex flex-col gap-4 h-fit relative w-full">
				<h1 className="text-xl font-medium shrink-0 pt-6 pl-10">
					Customers
				</h1>
				<div>
					<div className="flex w-full justify-between sticky top-0 z-10 border-y h-10 bg-stone-100 pl-10 pr-7 items-center">
						<div className="flex gap-4 items-center">
							<div className="flex justify-center items-center gap-8 text-xs text-t3 pr-1 rounded-sm shrink-0 w-[100px]">
								{paginationLoading && !searching ? (
									<div className="h-8 flex items-center justify-center">
										<SmallSpinner />
									</div>
								) : (
									<Pagination className="w-fit h-8 text-xs ">
										<PaginationContent className="w-full flex justify-between ">
											<PaginationItem>
												<PaginationPrevious
													onClick={handlePreviousPage}
													isActive={
														queryStates.page !== 1
													}
													className="text-xs cursor-pointer p-1 h-6"
												/>
											</PaginationItem>
											<PaginationItem className="">
												{queryStates.page} /{" "}
												{Math.max(totalPages, 1)}
											</PaginationItem>
											<PaginationItem>
												<PaginationNext
													onClick={handleNextPage}
													isActive={
														queryStates.page !==
														totalPages
													}
													className="text-xs cursor-pointer p-1 h-6"
												/>
											</PaginationItem>
										</PaginationContent>
									</Pagination>
								)}
							</div>
							<SearchBar
								query={queryStates.q || ""}
								setQuery={(query: string) =>
									setQueryStates({ q: query })
								}
								setCurrentPage={(page: number) => {
									setQueryStates({
										page: page,
										lastItemId: "",
									});
								}}
								mutate={mutate}
								setSearching={setSearching}
							/>
							<div className="h-10 flex items-center gap-2">
								<div className="border-r pr-4 flex items-center gap-2">
									<FilterButton />
									<p className="text-t2 px-1 rounded-md bg-stone-200 text-sm">
										{data?.totalCount}
									</p>
								</div>
								{savedViewsData?.views?.length > 0 && (
									<div className="border-r pr-4 pl-2 flex items-center">
										<SavedViewsDropdown />
									</div>
								)}
							</div>
						</div>
						<div className="flex gap-4">
							<CreateCustomer />
						</div>
					</div>
					{data?.customers?.length > 0 ? (
						<div className="h-fit max-h-full">
							<CustomersTable customers={data.customers} />
						</div>
					) : (
						<div className="flex flex-col px-10 mt-3 text-t3 text-sm w-full min-h-[60vh] gap-4">
							{/* <img
                src="./customer.png"
                alt="No customers"
                className="w-48 h-48 opacity-60 filter grayscale"
                // className="w-48 h-48 opacity-80 filter brightness-0 invert" // this is for dark mode
              /> */}
							<span>
								{
									// Show loading state during search transitions to prevent flash of incorrect message

									queryStates.q?.trim()
										? "No matching results found. Try a different search."
										: "Create your first customer by interacting with an Autumn function via the API."
								}
							</span>
						</div>
					)}
				</div>
				{/* <div className="shrink-0 sticky bottom-0">
          <CreateCustomer />
        </div> */}
			</div>
		</CustomersContext.Provider>
	);
}

export default CustomersView;

{
	/* <p className="text-t3 text-sm whitespace-nowrap items-center flex gap-1">
              <span className="font-semibold">{data?.totalCount} </span>
              {data?.totalCount === 1 ? "Customer" : "Customers"}
            </p> */
}
