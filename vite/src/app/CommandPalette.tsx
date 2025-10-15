import type { CustomerSchema } from "@autumn/shared";
import { ArrowsClockwiseIcon, AtIcon, GearIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { AppEnv } from "autumn-js";
import { CircleUserRoundIcon, GiftIcon, PackageIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { useListOrganizations } from "@/lib/auth-client";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import { navigateTo } from "@/utils/genUtils";
import { impersonateUser } from "@/views/admin/adminUtils";
import { useAdmin } from "@/views/admin/hooks/useAdmin";
import { handleSwitchOrg } from "@/views/main-sidebar/components/OrgDropdown";
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
	const [currentPage, setCurrentPage] = useState<
		"main" | "impersonate" | "orgs"
	>("main");

	// Refs to persist content during close animation
	const closeTimeoutRef = useRef<NodeJS.Timeout>();
	const lastRenderedContentRef = useRef<React.ReactNode>(null);
	const isTransitioningRef = useRef(false);

	const navigate = useNavigate();
	const env = useEnv();
	const { data: orgs, isPending: isLoadingOrgs } = useListOrganizations();
	const axiosInstance = useAxiosInstance();
	const { isAdmin } = useAdmin();

	// Improved close dialog function with proper timing
	const closeDialog = useCallback(() => {
		// Mark that we're transitioning to prevent state updates during close
		isTransitioningRef.current = true;

		// Close the dialog immediately
		setOpen(false);

		// Clear any existing timeout
		if (closeTimeoutRef.current) {
			clearTimeout(closeTimeoutRef.current);
		}

		// Delay state reset to after dialog animation completes (300ms typical for dialog animations)
		closeTimeoutRef.current = setTimeout(() => {
			setSearch("");
			setDebouncedSearch("");
			setCurrentPage("main");
			isTransitioningRef.current = false;
			lastRenderedContentRef.current = null;
		}, 300);
	}, []);

	// Helper to switch pages without causing flash
	const switchToPage = useCallback((page: "main" | "impersonate" | "orgs") => {
		if (!isTransitioningRef.current) {
			// Batch state updates to prevent multiple re-renders
			setCurrentPage(page);
			setSearch("");
			setDebouncedSearch("");
		}
	}, []);

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
		const variantClasses = "bg-t7 !text-primary-foreground";

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
		(e) => {
			if (currentPage === "impersonate" || currentPage === "orgs") {
				e.preventDefault(); // Prevent default ESC behavior (closing dialog)
				switchToPage("main");
			}
		},
		{ enableOnFormTags: true },
	);

	// Clean up timeout on unmount
	useEffect(() => {
		return () => {
			if (closeTimeoutRef.current) {
				clearTimeout(closeTimeoutRef.current);
			}
		};
	}, []);

	// Only reset states when dialog opens (not when it closes)
	useEffect(() => {
		if (open) {
			// Reset transitioning state when opening
			isTransitioningRef.current = false;
			lastRenderedContentRef.current = null;
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
			icon: <PackageIcon className="mr-1 size-3.5" />,
			onSelect: () => {
				navigateTo("/products", navigate, env);
				closeDialog();
			},
		},
		{
			label: "Go to Features",
			icon: <GearIcon className="mr-1 size-3.5" />,
			onSelect: () => {
				navigateTo("/products?tab=features", navigate, env);
				closeDialog();
			},
		},
		{
			label: "Go to Rewards",
			icon: <GiftIcon className="mr-1 size-3.5" />,
			onSelect: () => {
				navigateTo("/products?tab=rewards", navigate, env);
				closeDialog();
			},
		},
		{
			label: `Go to ${env === AppEnv.Sandbox ? "Production" : "Sandbox"}`,
			icon: <ArrowsClockwiseIcon className="mr-1 size-3.5" />,
			onSelect: () => {
				handleEnvChange(
					env === AppEnv.Sandbox ? AppEnv.Live : AppEnv.Sandbox,
					true,
				);
				closeDialog();
			},
		},
		...(!isLoadingOrgs && orgs && orgs.length > 1
			? [
					{
						label: "Switch Organization",
						icon: <AtIcon className="mr-1 size-3.5" />,
						onSelect: () => switchToPage("orgs"),
					},
				]
			: []),
		...(isAdmin
			? [
					{
						label: "Impersonate",
						icon: <CircleUserRoundIcon className="mr-1 size-3.5" />,
						onSelect: () => switchToPage("impersonate"),
					},
				]
			: []),
	];

	// Safe keyboard shortcuts - directly call functions instead of relying on array indices
	useHotkeys(
		"meta+1",
		() => {
			navigateTo("/products", navigate, env);
			closeDialog();
		},
		{ enableOnFormTags: true, preventDefault: true },
	);

	useHotkeys(
		"meta+2",
		() => {
			navigateTo("/products?tab=features", navigate, env);
			closeDialog();
		},
		{ enableOnFormTags: true, preventDefault: true },
	);

	useHotkeys(
		"meta+3",
		() => {
			navigateTo("/products?tab=rewards", navigate, env);
			closeDialog();
		},
		{ enableOnFormTags: true, preventDefault: true },
	);

	useHotkeys(
		"meta+4",
		() => {
			handleEnvChange(
				env === AppEnv.Sandbox ? AppEnv.Live : AppEnv.Sandbox,
				true,
			);
			closeDialog();
		},
		{ enableOnFormTags: true, preventDefault: true },
	);

	// CMD+5: Switch Organization (only if user has multiple orgs)
	useHotkeys(
		"meta+5",
		() => {
			if (!isLoadingOrgs && orgs && orgs.length > 1) {
				switchToPage("orgs");
			}
		},
		{ enableOnFormTags: true, preventDefault: true },
	);

	// CMD+6: Impersonate (only if user is admin)
	useHotkeys(
		"meta+6",
		() => {
			if (isAdmin) {
				switchToPage("impersonate");
			}
		},
		{ enableOnFormTags: true, preventDefault: true },
	);

	const renderMainPage = () => (
		<>
			{!showResults && (
				<CommandGroup>
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
							{(() => {
								// Show keyboard shortcuts based on item type, not index
								if (item.label === "Go to Products") {
									return (
										<span className="flex items-center gap-0.5">
											{keystrokeContainer(getMetaKey())}
											{keystrokeContainer("1")}
										</span>
									);
								}
								if (item.label === "Go to Features") {
									return (
										<span className="flex items-center gap-0.5">
											{keystrokeContainer(getMetaKey())}
											{keystrokeContainer("2")}
										</span>
									);
								}
								if (item.label === "Go to Rewards") {
									return (
										<span className="flex items-center gap-0.5">
											{keystrokeContainer(getMetaKey())}
											{keystrokeContainer("3")}
										</span>
									);
								}
								if (item.label.includes("Go to")) {
									// Environment switch
									return (
										<span className="flex items-center gap-0.5">
											{keystrokeContainer(getMetaKey())}
											{keystrokeContainer("4")}
										</span>
									);
								}
								if (
									item.label === "Switch Organization" &&
									!isLoadingOrgs &&
									orgs &&
									orgs.length > 1
								) {
									return (
										<span className="flex items-center gap-0.5">
											{keystrokeContainer(getMetaKey())}
											{keystrokeContainer("5")}
										</span>
									);
								}
								if (item.label === "Impersonate" && isAdmin) {
									return (
										<span className="flex items-center gap-0.5">
											{keystrokeContainer(getMetaKey())}
											{keystrokeContainer("6")}
										</span>
									);
								}
								return null;
							})()}
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
												closeDialog();
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

								const product = result.data as any;
								return (
									<CommandItem
										key={`product-${product.id}`}
										onSelect={() => {
											navigateTo(`/products/${product.id}`, navigate, env);
											closeDialog();
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
													closeDialog();
													await impersonateUser(user.id);
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
													closeDialog();
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

	const renderOrgsPage = () => {
		return (
			<>
				{orgs && orgs.length > 0 && (
					<CommandGroup>
						{orgs
							.filter((org) => {
								if (!search) return true;
								const lowerSearch = search.toLowerCase();
								return (
									org.name?.toLowerCase().includes(lowerSearch) ||
									org.slug?.toLowerCase().includes(lowerSearch)
								);
							})
							.map((org) => (
								<CommandItem
									key={`org-${org.id}`}
									onSelect={() => {
										handleSwitchOrg(org.id);
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
							))}
					</CommandGroup>
				)}

				{(!orgs || orgs.length === 0) && !isLoadingOrgs && (
					<CommandEmpty>No organizations found.</CommandEmpty>
				)}

				{isLoadingOrgs && (
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
			</>
		);
	};

	// Memoize the current content to prevent flashes during re-renders
	// Using a simpler approach to avoid complex dependency issues
	const currentContent =
		currentPage === "main"
			? renderMainPage()
			: currentPage === "impersonate"
				? renderImpersonatePage()
				: renderOrgsPage();

	// Store the last rendered content when we have valid content
	useEffect(() => {
		if (currentContent && !isTransitioningRef.current) {
			lastRenderedContentRef.current = currentContent;
		}
	}, [currentContent]);

	// Handle dialog open/close with our improved logic
	const handleOpenChange = useCallback(
		(newOpen: boolean) => {
			if (!newOpen) {
				closeDialog();
			} else {
				setOpen(true);
			}
		},
		[closeDialog],
	);

	return (
		<CommandDialog open={open} onOpenChange={handleOpenChange}>
			<CommandInput
				placeholder={
					currentPage === "main"
						? "Search customers and products..."
						: currentPage === "impersonate"
							? "Search users and organizations to impersonate..."
							: "Search organizations..."
				}
				value={search}
				onValueChange={setSearch}
			/>
			<CommandList>
				{/* Use last rendered content during transition to prevent flash */}
				{isTransitioningRef.current && lastRenderedContentRef.current
					? lastRenderedContentRef.current
					: currentContent}
			</CommandList>
		</CommandDialog>
	);
};

export default CommandPaletteComponent;
