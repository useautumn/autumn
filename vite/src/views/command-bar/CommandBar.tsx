import type { CustomerSchema } from "@autumn/shared";
import {
	ArrowsClockwiseIcon,
	AtIcon,
	FingerprintIcon,
	GearIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { AppEnv } from "autumn-js";
import { CircleUserRoundIcon, Monitor, Moon, PackageIcon, Sun } from "lucide-react";
import { useTheme } from "@/contexts/ThemeProvider";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useNavigate } from "react-router";
import type { z } from "zod";
import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandList,
} from "@/components/ui/command";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrg } from "@/hooks/common/useOrg";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useCommandBarStore } from "@/hooks/stores/useCommandBarStore";
import { useListOrganizations } from "@/lib/auth-client";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import { navigateTo } from "@/utils/genUtils";
import { impersonateUser } from "@/views/admin/adminUtils";
import { useAdmin } from "@/views/admin/hooks/useAdmin";
import { CommandRow } from "@/views/command-bar/command-row";
import { calculateRelevanceScore } from "@/views/command-bar/commandUtils";
import { useCommandBarHotkeys } from "@/views/command-bar/useCommandBarHotkeys";
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

const CommandBar = () => {
	const open = useCommandBarStore((state) => state.open);
	const setOpen = useCommandBarStore((state) => state.setOpen);
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
	const { org } = useOrg();
	const { theme, setTheme } = useTheme();

	const cycleTheme = useCallback(() => {
		const themeOrder = ["light", "dark", "system"] as const;
		const currentIndex = themeOrder.indexOf(theme);
		const nextIndex = (currentIndex + 1) % themeOrder.length;
		setTheme(themeOrder[nextIndex]);
	}, [theme, setTheme]);

	const getThemeIcon = () => {
		if (theme === "light") return <Sun />;
		if (theme === "dark") return <Moon />;
		return <Monitor />;
	};

	const getThemeLabel = () => {
		if (theme === "light") return "Light";
		if (theme === "dark") return "Dark";
		return "System";
	};

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
	}, [
		// Close the dialog immediately
		setOpen,
	]);

	// Helper to switch pages without causing flash
	const switchToPage = useCallback((page: "main" | "impersonate" | "orgs") => {
		if (!isTransitioningRef.current) {
			// Batch state updates to prevent multiple re-renders
			setCurrentPage(page);
			setSearch("");
			setDebouncedSearch("");
		}
	}, []);

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

	// Initialize hotkeys (only active when command bar is open)
	useCommandBarHotkeys({
		isOpen: open,
		closeDialog,
		cycleTheme,
		switchToOrgsPage: () => switchToPage("orgs"),
		switchToImpersonatePage: () => switchToPage("impersonate"),
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
			title: "Go to Plans",
			icon: <PackageIcon />,
			shortcutKey: "1",
			onSelect: () => {
				navigateTo("/products", navigate, env);
				closeDialog();
			},
		},
		{
			title: "Go to Features",
			icon: <GearIcon className="scale-[110%]" />,
			shortcutKey: "2",
			onSelect: () => {
				navigateTo("/products?tab=features", navigate, env);
				closeDialog();
			},
		},
		{
			title: "Go to Customers",
			icon: <CircleUserRoundIcon />,
			shortcutKey: "3",
			onSelect: () => {
				navigateTo("/customers", navigate, env);
				closeDialog();
			},
		},
		...(org?.deployed
			? [
					{
						title: `Go to ${env === AppEnv.Sandbox ? "Production" : "Sandbox"}`,
						icon: <ArrowsClockwiseIcon />,
						shortcutKey: "4",
						onSelect: () => {
							handleEnvChange(
								env === AppEnv.Sandbox ? AppEnv.Live : AppEnv.Sandbox,
								true,
							);
							closeDialog();
						},
					},
				]
			: []),
		{
			title: `Theme: ${getThemeLabel()}`,
			icon: getThemeIcon(),
			shortcutKey: "5",
			onSelect: () => {
				cycleTheme();
			},
		},
		...(!isLoadingOrgs && orgs && orgs.length > 1
			? [
					{
						title: "Switch Organization",
						icon: <AtIcon className="scale-[105%]" />,
						shortcutKey: "6",
						onSelect: () => switchToPage("orgs"),
					},
				]
			: []),
		...(isAdmin
			? [
					{
						title: "Impersonate",
						icon: <FingerprintIcon />,
						shortcutKey: "7",
						onSelect: () => switchToPage("impersonate"),
					},
				]
			: []),
	];

	const renderMainPage = () => (
		<>
			{!showResults && (
				<CommandGroup className="p-1.5">
					{navigationItems.map((item) => (
						<CommandRow
							key={item.title}
							icon={item.icon}
							title={item.title}
							shortcutKey={item.shortcutKey}
							onSelect={item.onSelect}
						/>
					))}
				</CommandGroup>
			)}

			{showResults && (
				<>
					{sortedResults.length > 0 && (
						<CommandGroup heading="Results" className="p-1.5">
							{sortedResults.map((result) => {
								if (result.type === "customer") {
									const customer = result.data;
									const displayName =
										customer.name ||
										customer.email ||
										customer.id ||
										customer.internal_id;
									const subtext =
										customer.email && customer.name
											? customer.email
											: undefined;

									return (
										<CommandRow
											key={`customer-${customer.internal_id}`}
											icon={<CircleUserRoundIcon />}
											title={displayName}
											subtext={subtext}
											onSelect={() => {
												navigateTo(
													`/customers/${customer.internal_id}`,
													navigate,
													env,
												);
												closeDialog();
											}}
										/>
									);
								}

								const product = result.data;
								const productTitle = `${product.name}${product.is_add_on ? " (Add-on)" : ""}`;

								return (
									<CommandRow
										key={`product-${product.id}`}
										icon={<PackageIcon />}
										title={productTitle}
										onSelect={() => {
											navigateTo(`/products/${product.id}`, navigate, env);
											closeDialog();
										}}
									/>
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
				{showResults && (
					<>
						{userResults.length > 0 && (
							<CommandGroup heading="Users" className="p-1.5">
								{userResults.map((result) => {
									const user = result.data as User;
									const displayName = user.name || user.email || user.id;
									const subtext =
										user.email && user.name ? user.email : undefined;

									return (
										<CommandRow
											key={`user-${user.id}`}
											icon={<CircleUserRoundIcon />}
											title={displayName}
											subtext={subtext}
											onSelect={async () => {
												try {
													closeDialog();
													await impersonateUser(user.id);
												} catch (error) {
													console.error("Failed to impersonate user:", error);
												}
											}}
										/>
									);
								})}
							</CommandGroup>
						)}

						{orgResults.length > 0 && (
							<CommandGroup heading="Organizations" className="p-1.5">
								{orgResults.map((result) => {
									const org = result.data as Org;
									const firstUser = org.users?.[0];
									if (!firstUser) return null;

									return (
										<CommandRow
											key={`org-${org.id}`}
											icon={<AtIcon />}
											title={org.name}
											subtext={org.slug}
											onSelect={async () => {
												try {
													await impersonateUser(firstUser.id);
													closeDialog();
												} catch (error) {
													console.error("Failed to impersonate user:", error);
												}
											}}
										/>
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
					<CommandGroup className="p-1.5">
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
								<CommandRow
									key={`org-${org.id}`}
									icon={<AtIcon />}
									title={org.name}
									subtext={org.slug}
									onSelect={() => {
										handleSwitchOrg(org.id);
									}}
								/>
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
		[closeDialog, setOpen],
	);

	return (
		<CommandDialog open={open} onOpenChange={handleOpenChange}>
			<CommandInput
				placeholder={
					currentPage === "main"
						? "Search customers and plans..."
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

export default CommandBar;
