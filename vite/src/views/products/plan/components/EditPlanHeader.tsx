import {
	Button,
	CopyButton,
	IconBadge,
	Select,
	SelectContent,
	SelectItem,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
	SmallSpinner,
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@autumn/ui";
import {
	ArrowsClockwiseIcon,
	TriangleIcon,
	UserIcon,
} from "@phosphor-icons/react";
import { parseAsString, useQueryStates } from "nuqs";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { AdminHover } from "@/components/general/AdminHover";
import V2Breadcrumb from "@/components/v2/breadcrumb";
import { RevenueCatIcon } from "@/components/v2/icons/AutumnIcons";
import { useAutumnFlags } from "@/hooks/common/useAutumnFlags";
import { useOrg } from "@/hooks/common/useOrg";
import { useRCMappings } from "@/hooks/queries/revcat/useRCMappings";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import {
	useIsCusPlanEditor,
	useProductStore,
} from "@/hooks/stores/useProductStore.ts";
import { useVariantViewStore } from "@/hooks/stores/useVariantViewStore.ts";
import { useEnv } from "@/utils/envUtils";
import { pushPage } from "@/utils/genUtils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery.tsx";
import { useCusProductQuery } from "@/views/customers/customer/product/hooks/useCusProductQuery.tsx";
import { useProductCountsQuery } from "../../product/hooks/queries/useProductCountsQuery";
import {
	useProductQuery,
	useProductQueryState,
} from "../../product/hooks/useProductQuery";
import {
	MigrateCustomersDialog,
	useMigratableVersions,
} from "../versioning/MigrateCustomersDialog";
import { CreateVariantButton } from "./CreateVariantButton";
import { PlanToolbar } from "./PlanToolbar.tsx";

const MIGRATE_CUSTOMERS = "__migrate_customers__";

export const EditPlanHeader = () => {
	const { numVersions, versionCounts, isLoading } = useProductQuery();
	const product = useProductStore((s) => s.product);
	const { counts } = useProductCountsQuery(
		product.version ? { version: product.version } : {},
	);
	const { queryStates, setQueryStates } = useProductQueryState();
	const navigate = useNavigate();
	const isCusPlanEditor = useIsCusPlanEditor();
	const flags = useAutumnFlags();
	const { mappings } = useRCMappings();
	const { org } = useOrg({ skipSandbox: false });
	const env = useEnv();
	const currency = org?.default_currency ?? "USD";
	const [migrateDialogOpen, setMigrateDialogOpen] = useState(false);
	const showAllVariants = useVariantViewStore((s) => s.showAllVariants);

	const pastVersionsWithCustomers = useMemo(() => {
		if (!numVersions || numVersions <= 1) return [];
		return Object.entries(versionCounts)
			.filter(([version, counts]) => {
				const v = Number(version);
				if (v >= numVersions) return false;
				return (counts.active ?? 0) > 0;
			})
			.map(([version]) => Number(version));
	}, [numVersions, versionCounts]);
	const migratableVersions = useMigratableVersions({
		productId: product.id,
		latestVersion: numVersions,
		pastVersions: pastVersionsWithCustomers,
		currency,
	});

	const hasRCMapping =
		flags.revenuecat &&
		mappings.some(
			(m) =>
				m.autumn_product_id === product.id &&
				m.revenuecat_product_ids.length > 0,
		);

	const vercelConfig = org?.processor_configs?.vercel;
	const vercelAllowedIds =
		env === "live"
			? vercelConfig?.allowed_product_ids_live
			: vercelConfig?.allowed_product_ids_sandbox;
	const hasVercelLink =
		flags.vercel &&
		!!vercelAllowedIds?.length &&
		vercelAllowedIds.includes(product.id);

	const versionOptions = Array.from(
		{ length: numVersions },
		(_, i) => numVersions - i,
	);
	const currentVersion = queryStates.version || product.version;

	const canMigrate = pastVersionsWithCustomers.length > 0 && !isCusPlanEditor;

	const handleVersionChange = (version: string) => {
		if (version === MIGRATE_CUSTOMERS) {
			setMigrateDialogOpen(true);
			return;
		}
		const versionNumber = parseInt(version, 10);
		if (versionNumber === numVersions && !isCusPlanEditor) {
			// Remove version param for latest version
			setQueryStates({ version: null });
		} else {
			setQueryStates({ version: versionNumber });
		}
	};

	const getProductAdminHover = () => {
		return [
			{
				key: "internal_product_id",
				value: product.internal_id,
			},
			{
				key: "stripe_id",
				value: product.stripe_id || "N/A",
			},
			{
				key: "customer_product_id",
				value: product.id || "N/A",
			},
		];
	};

	const handleCustomerCountClick = () => {
		const activeCount = counts?.active || 0;
		if (activeCount === 0) return;

		const versionKey = `${product.id}:${product.version}`;
		const path = pushPage({
			path: `/customers`,
			queryParams: { version: versionKey },
			preserveParams: false,
		});
		navigate(path, { state: { preAppliedFilters: true } });
	};

	return (
		<>
			<MigrateCustomersDialog
				open={migrateDialogOpen}
				onOpenChange={setMigrateDialogOpen}
				productId={product.id}
				latestVersion={numVersions}
				migratableVersions={migratableVersions}
				pastVersions={pastVersionsWithCustomers}
				versionCounts={versionCounts}
			/>
			<div className="flex flex-col gap-2 p-4 pb-3  border-none shadow-none w-full max-w-5xl mx-auto pt-4 sm:pt-8 px-4 sm:px-12">
				{isCusPlanEditor ? (
					<CustomerBreadcrumbs />
				) : (
					<V2Breadcrumb
						className="p-0"
						items={[
							{
								name: "Plans",
								href: "/products?tab=products",
							},
							{
								name: `${product.name}`,
								href: `/products/${product.id}`,
							},
						]}
					/>
				)}

				<div className="col-span-2 flex">
					<div className="flex flex-row items-baseline justify-start gap-2 w-full whitespace-nowrap">
						<AdminHover texts={getProductAdminHover() as any}>
							<span className="text-lg font-medium w-fit whitespace-nowrap">
								{product.name}
							</span>
						</AdminHover>
						<span className="text-sm text-tertiary-foreground">
							v{product.version}
						</span>
					</div>
				</div>
				<div className="flex flex-row justify-between items-center">
					<div className="flex flex-row gap-2">
						{product?.id && (
							<CopyButton
								side="bottom"
								text={product?.id ? product?.id : ""}
								size="mini"
								className="text-tertiary-foreground"
								innerClassName="max-w-30 text-tiny-id truncate"
							/>
						)}
						<AdminHover
							texts={[
								{ key: "active", value: counts?.active?.toString() || "0" },
								{ key: "canceled", value: counts?.canceled?.toString() || "0" },
								{ key: "custom", value: counts?.custom?.toString() || "0" },
							]}
						>
							<Button
								variant="skeleton"
								size="icon"
								onClick={handleCustomerCountClick}
							>
								<IconBadge variant="muted" icon={<UserIcon />}>
									{counts?.active || 0}
								</IconBadge>
							</Button>
						</AdminHover>
						{hasRCMapping && (
							<Tooltip>
								<TooltipTrigger>
									<IconBadge
										variant="muted"
										icon={<RevenueCatIcon size={14} />}
									>
										RC
									</IconBadge>
								</TooltipTrigger>
								<TooltipContent>
									This plan is linked to RevenueCat for mobile billing
								</TooltipContent>
							</Tooltip>
						)}
						{hasVercelLink && (
							<Tooltip>
								<TooltipTrigger>
									<IconBadge
										variant="muted"
										icon={<TriangleIcon size={12} weight="fill" />}
									></IconBadge>
								</TooltipTrigger>
								<TooltipContent>
									This plan is linked to Vercel Marketplace
								</TooltipContent>
							</Tooltip>
						)}
					</div>

					<div className="flex flex-row gap-2 items-center">
						<VariantSelect />
						{numVersions && numVersions > 1 && (
							<Select
								value={currentVersion.toString()}
								onValueChange={handleVersionChange}
								disabled={showAllVariants}
								items={{
									...Object.fromEntries(
										versionOptions.map((version) => [
											version.toString(),
											`Version ${version}`,
										]),
									),
									...(canMigrate
										? { [MIGRATE_CUSTOMERS]: "Migrate customers" }
										: {}),
								}}
							>
								{showAllVariants ? (
									<Tooltip>
										<TooltipTrigger render={<span />}>
											<SelectTrigger className="w-fit min-w-28 !h-6" size="sm">
												<SelectValue placeholder="Version" />
											</SelectTrigger>
										</TooltipTrigger>
										<TooltipContent>
											Latest versions of all plans are shown
										</TooltipContent>
									</Tooltip>
								) : (
									<SelectTrigger className="w-fit min-w-28 !h-6" size="sm">
										<SelectValue placeholder="Version" />
									</SelectTrigger>
								)}
								<SelectContent>
									{versionOptions.map((version) => {
										const count = versionCounts[version]?.active || 0;
										const hasLoaded = Object.keys(versionCounts).length > 0;
										return (
											<SelectItem key={version} value={version.toString()}>
												<div className="flex items-center justify-between w-full gap-3">
													<span>Version {version}</span>
													{hasLoaded ? (
														<IconBadge variant="muted" icon={<UserIcon />}>
															{count}
														</IconBadge>
													) : (
														<SmallSpinner
															size={10}
															className="text-tertiary-foreground"
														/>
													)}
												</div>
											</SelectItem>
										);
									})}
									{canMigrate && (
										<>
											<SelectSeparator />
											<SelectItem value={MIGRATE_CUSTOMERS}>
												<div className="flex items-center gap-2">
													<ArrowsClockwiseIcon />
													<span>Migrate customers</span>
												</div>
											</SelectItem>
										</>
									)}
								</SelectContent>
							</Select>
						)}
						{!isCusPlanEditor && (
							<>
								<CreateVariantButton />
								<PlanToolbar />
							</>
						)}
					</div>
				</div>
			</div>
		</>
	);
};

const SHOW_ALL_VARIANTS = "__show_all_variants__";

const VariantSelect = () => {
	const product = useProductStore((s) => s.product);
	const { products } = useProductsQuery();
	const navigate = useNavigate();
	const showAllVariants = useVariantViewStore((s) => s.showAllVariants);
	const setShowAllVariants = useVariantViewStore((s) => s.setShowAllVariants);

	// base_id is only populated on products-list entries, not the store product,
	// so resolve it from the list. A base plan is its own base.
	const baseId = useMemo(() => {
		const current = products.find((p) => p.id === product.id);
		return current?.base_id ?? product.id;
	}, [products, product.id]);

	const variantOptions = useMemo(() => {
		const base = products.find((p) => p.id === baseId);
		const variants = products
			.filter((p) => p.base_id === baseId)
			.sort((a, b) => a.name.localeCompare(b.name));
		return base ? [base, ...variants] : variants;
	}, [products, baseId]);

	const hasVariants = variantOptions.some((p) => p.id !== baseId);
	if (!hasVariants) return null;

	const handleChange = (id: string) => {
		if (id === SHOW_ALL_VARIANTS) {
			setShowAllVariants(true);
			// Variant cards only exist on the base, so focus it.
			if (product.id !== baseId) {
				pushPage({
					navigate,
					path: `/products/${baseId}`,
					preserveParams: false,
				});
			}
			return;
		}
		setShowAllVariants(false);
		if (id === product.id) return;
		pushPage({ navigate, path: `/products/${id}`, preserveParams: false });
	};

	return (
		<Select
			value={showAllVariants ? SHOW_ALL_VARIANTS : product.id}
			onValueChange={handleChange}
			items={{
				...Object.fromEntries(variantOptions.map((v) => [v.id, v.name])),
				[SHOW_ALL_VARIANTS]: "All variants",
			}}
		>
			<SelectTrigger className="w-fit min-w-28 max-w-48 !h-6" size="sm">
				<SelectValue placeholder="Variant" className="min-w-0 truncate" />
			</SelectTrigger>
			<SelectContent>
				{variantOptions.map((variant) => (
					<SelectItem key={variant.id} value={variant.id}>
						<div className="flex items-center justify-between w-full gap-3">
							<span>{variant.name}</span>
							{variant.id === baseId && (
								<IconBadge variant="muted">Base</IconBadge>
							)}
						</div>
					</SelectItem>
				))}
				<SelectSeparator />
				<SelectItem value={SHOW_ALL_VARIANTS}>
					<span>Show all variants</span>
				</SelectItem>
			</SelectContent>
		</Select>
	);
};

const CustomerBreadcrumbs = () => {
	const { customer } = useCusQuery();
	const { product: cusProductQueryProduct } = useCusProductQuery();
	const storeProduct = useProductStore((s) => s.product);
	const [{ entity_id }] = useQueryStates({
		entity_id: parseAsString,
	});
	//find entity name
	const entity = customer.entities.find((e: any) => e.id === entity_id);

	// Use store product if cusProductQuery doesn't have it (e.g., in inline editor)
	const productName = cusProductQueryProduct?.name || storeProduct?.name || "";

	return (
		<V2Breadcrumb
			className="p-0"
			items={[
				{
					name: "Customers",
					href: "/products?tab=products",
				},
				{
					name: customer.name || customer.email || customer.id,
					href: `/customers/${customer.id}`,
				},
				...(entity_id
					? [
							{
								name: (entity?.name || entity_id) ?? "",
								href: `/customers/${customer.id}?entity_id=${entity_id}`,
							},
						]
					: []),

				{
					name: productName,
				},
			]}
		/>
	);
};
