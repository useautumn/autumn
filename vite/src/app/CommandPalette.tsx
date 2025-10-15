import type { CustomerSchema } from "@autumn/shared";
import {
	ArrowsClockwiseIcon,
	AtIcon,
	PackageIcon,
	StackIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { AppEnv } from "autumn-js";
import { CircleUserRoundIcon, GiftIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useNavigate } from "react-router";
import type { z } from "zod";
import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { Skeleton } from "@/components/ui/skeleton";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import { navigateTo } from "@/utils/genUtils";
import { impersonateUser } from "@/views/admin/adminUtils";
import { useAdmin } from "@/views/admin/hooks/useAdmin";
import { handleEnvChange } from "@/views/main-sidebar/EnvDropdown";

type Customer = z.infer<typeof CustomerSchema>;

type User = {
	id: string;
	name: string;
	email: string;
	createdAt: string;
	lastSignedIn: string;
};

type Org = {
	id: string;
	name: string;
	slug: string;
	createdAt: string;
	users: User[];
};

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
	const matrix: number[][] = [];

	for (let i = 0; i <= b.length; i++) {
		matrix[i] = [i];
	}

	for (let j = 0; j <= a.length; j++) {
		matrix[0][j] = j;
	}

	for (let i = 1; i <= b.length; i++) {
		for (let j = 1; j <= a.length; j++) {
			if (b.charAt(i - 1) === a.charAt(j - 1)) {
				matrix[i][j] = matrix[i - 1][j - 1];
			} else {
				matrix[i][j] = Math.min(
					matrix[i - 1][j - 1] + 1,
					matrix[i][j - 1] + 1,
					matrix[i - 1][j] + 1,
				);
			}
		}
	}

	return matrix[b.length][a.length];
}

/**
 * Calculate relevance score for a search term against text
 * Lower score = better match
 */
function calculateRelevanceScore(searchTerm: string, text: string): number {
	const lowerSearch = searchTerm.toLowerCase();
	const lowerText = text.toLowerCase();

	// Exact match = best score
	if (lowerText === lowerSearch) return 0;

	// Starts with search term = very good score
	if (lowerText.startsWith(lowerSearch)) return 1;

	// Contains search term = good score
	const indexOfSearch = lowerText.indexOf(lowerSearch);
	if (indexOfSearch !== -1) {
		// Earlier in string = better score
		return 2 + indexOfSearch / 100;
	}

	// Use Levenshtein distance for fuzzy matching
	// Add 100 to differentiate from substring matches
	return 100 + levenshteinDistance(lowerSearch, lowerText);
}

const CommandPaletteComponent = () => {
	const [open, setOpen] = useState<boolean>(false);
	const [search, setSearch] = useState("");
	const [debouncedSearch, setDebouncedSearch] = useState("");
	const [currentPage, setCurrentPage] = useState<"main" | "impersonate">(
		"main",
	);

	const navigate = useNavigate();
	const env = useEnv();
	const axiosInstance = useAxiosInstance();
	const { isAdmin } = useAdmin();

	const getMetaKey = () => {
		if (navigator.userAgent.includes("Mac")) {
			return "⌘";
		}
		return "Ctrl";
	};

	const keystrokeContainer = (keyStroke: string) => {
		const isSingleChar = keyStroke.length === 1;
		const sizeClasses = isSingleChar ? "w-4" : "px-1";
		const baseClasses = `flex items-center justify-center ${sizeClasses} h-4 rounded-md text-tiny font-medium`;
		const variantClasses = "bg-purple-medium/60 !text-primary-foreground";

		return (
			<div className={`${baseClasses} ${variantClasses}`}>
				<span>{keyStroke}</span>
			</div>
		);
	};

	const { products, isLoading: productsLoading } = useProductsQuery();

	// Debounce search for backend query
	useEffect(() => {
		const timer = setTimeout(() => {
			setDebouncedSearch(search);
		}, 300);
		return () => clearTimeout(timer);
	}, [search]);

	// Search customers from backend with debounced search term
	const { data: searchedCustomersData, isLoading: searchCustomersLoading } =
		useQuery<{
			customers: Customer[];
		}>({
			queryKey: ["command-palette-customers-search", debouncedSearch],
			queryFn: async () => {
				// Always use the search term in the backend query
				const { data } = await axiosInstance.post(`/customers/all/search`, {
					search: debouncedSearch,
					filters: {},
					page: 1,
					page_size: 50,
				});
				return { customers: data.customers };
			},
			enabled: open && debouncedSearch.length > 0 && currentPage === "main",
		});

	// Search users for impersonation
	const { data: searchedUsersData, isLoading: searchUsersLoading } = useQuery<{
		rows: User[];
	}>({
		queryKey: ["command-palette-users-search", debouncedSearch],
		queryFn: async () => {
			const params = new URLSearchParams();
			if (debouncedSearch) params.append("search", debouncedSearch);
			const { data } = await axiosInstance.get(
				`/admin/users?${params.toString()}`,
			);
			return data;
		},
		enabled:
			open &&
			debouncedSearch.length > 0 &&
			currentPage === "impersonate" &&
			isAdmin,
	});

	// Search orgs for impersonation
	const { data: searchedOrgsData, isLoading: searchOrgsLoading } = useQuery<{
		rows: Org[];
	}>({
		queryKey: ["command-palette-orgs-search", debouncedSearch],
		queryFn: async () => {
			const params = new URLSearchParams();
			if (debouncedSearch) params.append("search", debouncedSearch);
			const { data } = await axiosInstance.get(
				`/admin/orgs?${params.toString()}`,
			);
			return data;
		},
		enabled:
			open &&
			debouncedSearch.length > 0 &&
			currentPage === "impersonate" &&
			isAdmin,
	});

	useHotkeys("meta+k", () => {
		setOpen(true);
	});

	useHotkeys(
		"escape",
		() => {
			if (currentPage === "impersonate") {
				setCurrentPage("main");
				setSearch("");
				setDebouncedSearch("");
			}
		},
		{ enableOnFormTags: true },
	);

	useEffect(() => {
		if (!open) {
			setSearch("");
			setDebouncedSearch("");
			setCurrentPage("main");
		}
	}, [open]);

	const showResults = search.length > 0;
	const rawCustomers = searchedCustomersData?.customers || [];
	const rawUsers = searchedUsersData?.rows || [];
	const rawOrgs = searchedOrgsData?.rows || [];

	// Combine and sort all results by relevance
	const sortedResults = useMemo(() => {
		if (!search) return [];

		if (currentPage === "main") {
			const customerResults = rawCustomers.map((customer) => {
				const nameScore = calculateRelevanceScore(search, customer.name || "");
				const emailScore = calculateRelevanceScore(
					search,
					customer.email || "",
				);
				const idScore = calculateRelevanceScore(search, customer.id || "");
				const internalIdScore = calculateRelevanceScore(
					search,
					customer.internal_id || "",
				);
				const score = Math.min(nameScore, emailScore, idScore, internalIdScore);
				return { type: "customer" as const, data: customer, score };
			});

			const lowerSearch = search.toLowerCase();
			const productResults = products
				.filter((product) => {
					const name = product.name?.toLowerCase() || "";
					const id = product.id?.toLowerCase() || "";
					return name.includes(lowerSearch) || id.includes(lowerSearch);
				})
				.map((product) => {
					const nameScore = calculateRelevanceScore(search, product.name || "");
					const idScore = calculateRelevanceScore(search, product.id || "");
					const score = Math.min(nameScore, idScore);
					return { type: "product" as const, data: product, score };
				});

			// Combine and sort all results together
			return [...customerResults, ...productResults]
				.sort((a, b) => a.score - b.score)
				.slice(0, 15);
		}

		if (currentPage === "impersonate") {
			const userResults = rawUsers.map((user) => {
				const nameScore = calculateRelevanceScore(search, user.name || "");
				const emailScore = calculateRelevanceScore(search, user.email || "");
				const idScore = calculateRelevanceScore(search, user.id || "");
				const score = Math.min(nameScore, emailScore, idScore);
				return { type: "user" as const, data: user, score };
			});

			const orgResults = rawOrgs.map((org) => {
				const nameScore = calculateRelevanceScore(search, org.name || "");
				const slugScore = calculateRelevanceScore(search, org.slug || "");
				const idScore = calculateRelevanceScore(search, org.id || "");
				const score = Math.min(nameScore, slugScore, idScore);
				return { type: "org" as const, data: org, score };
			});

			return [...userResults, ...orgResults]
				.sort((a, b) => a.score - b.score)
				.slice(0, 15);
		}

		return [];
	}, [rawCustomers, products, rawUsers, rawOrgs, search, currentPage]);

	// Show loading if:
	// 1. Products are loading, OR
	// 2. User is typing and we're waiting for debounce, OR
	// 3. Query is actively loading
	const isWaitingForDebounce = search !== debouncedSearch;
	const isLoading =
		currentPage === "main"
			? productsLoading || searchCustomersLoading || isWaitingForDebounce
			: searchUsersLoading || searchOrgsLoading || isWaitingForDebounce;

	const navigationItems = [
		{
			label: "Go to Products",
			icon: <PackageIcon className="mr-2 size-3.5" />,
			onSelect: () => {
				navigateTo("/products", navigate, env);
				setOpen(false);
			},
		},
		{
			label: "Go to Features",
			icon: <StackIcon className="mr-2 size-3.5" />,
			onSelect: () => {
				navigateTo("/products?tab=features", navigate, env);
				setOpen(false);
			},
		},
		{
			label: "Go to Rewards",
			icon: <GiftIcon className="mr-2 size-3.5" />,
			onSelect: () => {
				navigateTo("/products?tab=rewards", navigate, env);
				setOpen(false);
			},
		},
		{
			label: `Go to ${env === AppEnv.Sandbox ? "Production" : "Sandbox"}`,
			icon: <ArrowsClockwiseIcon className="mr-2 size-3.5" />,
			onSelect: () => {
				handleEnvChange(
					env === AppEnv.Sandbox ? AppEnv.Live : AppEnv.Sandbox,
					true,
				);
				setOpen(false);
			},
		},
		...(isAdmin
			? [
					{
						label: "Impersonate",
						icon: <CircleUserRoundIcon className="mr-2 size-3.5" />,
						onSelect: () => {
							setCurrentPage("impersonate");
							setSearch("");
							setDebouncedSearch("");
						},
					},
				]
			: []),
	];

	useHotkeys(
		"meta+1",
		() => {
			if (navigationItems[0]) {
				navigationItems[0].onSelect();
			}
		},
		{ enableOnFormTags: true, preventDefault: true },
	);

	useHotkeys(
		"meta+2",
		() => {
			if (navigationItems[1]) {
				navigationItems[1].onSelect();
			}
		},
		{ enableOnFormTags: true, preventDefault: true },
	);

	useHotkeys(
		"meta+3",
		() => {
			if (navigationItems[2]) {
				navigationItems[2].onSelect();
			}
		},
		{ enableOnFormTags: true, preventDefault: true },
	);

	useHotkeys(
		"meta+4",
		() => {
			if (navigationItems[3]) {
				navigationItems[3].onSelect();
			}
		},
		{ enableOnFormTags: true, preventDefault: true },
	);

	useHotkeys(
		"meta+5",
		() => {
			if (navigationItems[4] && isAdmin) {
				navigationItems[4].onSelect();
			}
		},
		{ enableOnFormTags: true, preventDefault: true },
	);

	const renderMainPage = () => (
		<>
			{!showResults && (
				<CommandGroup heading="Navigation" className="text-body-secondary">
					{navigationItems.map((item, index) => (
						<CommandItem
							key={item.label}
							onSelect={item.onSelect}
							className="text-body flex justify-between items-center"
						>
							<div className="flex items-center">
								{item.icon}
								{item.label}
							</div>
							{index < 5 && (
								<span className="flex items-center gap-0.5">
									{keystrokeContainer(getMetaKey())}
									{keystrokeContainer((index + 1).toString())}
								</span>
							)}
						</CommandItem>
					))}
				</CommandGroup>
			)}

			{showResults && (
				<>
					{sortedResults.length > 0 && (
						<CommandGroup heading="Results">
							{sortedResults.map((result) => {
								if (result.type === "customer") {
									const customer = result.data;
									const displayName =
										customer.name ||
										customer.email ||
										customer.id ||
										customer.internal_id;
									return (
										<CommandItem
											key={`customer-${customer.internal_id}`}
											onSelect={() => {
												navigateTo(
													`/customers/${customer.internal_id}`,
													navigate,
													env,
												);
												setOpen(false);
											}}
										>
											<CircleUserRoundIcon className="mr-2" size={14} />
											<div className="flex items-center gap-2">
												<span>{displayName}</span>
												{customer.email && customer.name && (
													<span className="text-xs text-muted-foreground">
														{customer.email}
													</span>
												)}
											</div>
										</CommandItem>
									);
								}

								const product = result.data;
								return (
									<CommandItem
										key={`product-${product.id}`}
										onSelect={() => {
											navigateTo(`/products/${product.id}`, navigate, env);
											setOpen(false);
										}}
									>
										<PackageIcon className="mr-2" size={14} />
										<span>
											{product.name}
											{product.is_add_on && " (Add-on)"}
										</span>
									</CommandItem>
								);
							})}
						</CommandGroup>
					)}

					{isLoading && sortedResults.length === 0 && (
						<div className="py-2 px-4">
							{[...Array(2)].map((_, i) => (
								<div key={i} className="flex items-center gap-3 py-2">
									<div className="shrink-0">
										<Skeleton className="h-5 w-5 rounded-full" />
									</div>
									<div className="flex flex-col gap-1 w-full">
										<Skeleton className="h-4 w-3/5" />
									</div>
								</div>
							))}
						</div>
					)}

					{!isLoading && sortedResults.length === 0 && (
						<CommandEmpty>No results found.</CommandEmpty>
					)}
				</>
			)}
		</>
	);

	const renderImpersonatePage = () => {
		const userResults = sortedResults.filter((r) => r.type === "user");
		const orgResults = sortedResults.filter((r) => r.type === "org");

		return (
			<>
				{!showResults && (
					<CommandGroup
						heading="Search users and organizations to impersonate"
						className="text-body-secondary"
					>
						<div className="px-2 py-1 text-sm text-muted-foreground">
							Start typing to search...
						</div>
					</CommandGroup>
				)}

				{showResults && (
					<>
						{userResults.length > 0 && (
							<CommandGroup heading="Users">
								{userResults.map((result) => {
									const user = result.data as User;
									const displayName = user.name || user.email || user.id;
									return (
										<CommandItem
											key={`user-${user.id}`}
											onSelect={async () => {
												try {
													await impersonateUser(user.id);
													setOpen(false);
												} catch (error) {
													console.error("Failed to impersonate user:", error);
												}
											}}
										>
											<CircleUserRoundIcon className="mr-2" size={14} />
											<div className="flex items-center gap-2">
												<span>{displayName}</span>
												{user.email && user.name && (
													<span className="text-xs text-muted-foreground">
														{user.email}
													</span>
												)}
											</div>
										</CommandItem>
									);
								})}
							</CommandGroup>
						)}

						{orgResults.length > 0 && (
							<CommandGroup heading="Organizations">
								{orgResults.map((result) => {
									const org = result.data as Org;
									const firstUser = org.users?.[0];
									if (!firstUser) return null;

									return (
										<CommandItem
											key={`org-${org.id}`}
											onSelect={async () => {
												try {
													await impersonateUser(firstUser.id);
													setOpen(false);
												} catch (error) {
													console.error("Failed to impersonate user:", error);
												}
											}}
										>
											<AtIcon className="mr-2" size={14} />
											<div className="flex items-center gap-2">
												<span>{org.name}</span>
												<span className="text-xs text-muted-foreground">
													{org.slug}
												</span>
											</div>
										</CommandItem>
									);
								})}
							</CommandGroup>
						)}

						{isLoading && sortedResults.length === 0 && (
							<div className="py-2 px-4">
								{[...Array(2)].map((_, i) => (
									<div key={i} className="flex items-center gap-3 py-2">
										<div className="shrink-0">
											<Skeleton className="h-5 w-5 rounded-full" />
										</div>
										<div className="flex flex-col gap-1 w-full">
											<Skeleton className="h-4 w-3/5" />
										</div>
									</div>
								))}
							</div>
						)}

						{!isLoading && sortedResults.length === 0 && (
							<CommandEmpty>No users or organizations found.</CommandEmpty>
						)}
					</>
				)}
			</>
		);
	};

	return (
		<CommandDialog open={open} onOpenChange={setOpen}>
			<CommandInput
				placeholder={
					currentPage === "main"
						? "Search customers and products..."
						: "Search users and organizations to impersonate..."
				}
				value={search}
				onValueChange={setSearch}
			/>
			<CommandList>
				{currentPage === "main" ? renderMainPage() : renderImpersonatePage()}
			</CommandList>
		</CommandDialog>
	);
};

export default CommandPaletteComponent;
