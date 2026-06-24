import { Checkbox } from "@autumn/ui";
import {
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from "@autumn/ui";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { cn } from "@/lib/utils";
import { getVersionCounts } from "@/utils/productUtils";
import { useCustomerFilters } from "../../hooks/useCustomerFilters";

export const ProductsSubMenu = ({ onChange }: { onChange?: () => void }) => {
	const { products } = useProductsQuery();
	const { queryStates, setFilters } = useCustomerFilters();
	const versionCounts = getVersionCounts(products);

	const selectedVersions = queryStates.version;

	// Deduplicate products by ID (since backend may return multiple entries per product, one per version)
	const uniqueProducts =
		products?.reduce((acc: any[], product: any) => {
			if (!acc.find((p) => p.id === product.id)) {
				acc.push(product);
			}
			return acc;
		}, []) || [];

	// Get all possible product:version combinations
	const getAllProductVersions = () => {
		const productVersions: Array<{
			productId: string;
			version: string;
			key: string;
		}> = [];
		uniqueProducts?.forEach((product: any) => {
			const versionCount = versionCounts?.[product.id] || 1;
			for (let v = 1; v <= versionCount; v++) {
				productVersions.push({
					productId: product.id,
					version: v.toString(),
					key: `${product.id}:${v}`,
				});
			}
		});
		return productVersions;
	};

	const allProductVersions = getAllProductVersions();
	const hasSelections = selectedVersions.length > 0;

	// Calculate unique products that have at least one version selected
	const selectedProductIds = new Set(
		selectedVersions.map((versionKey: string) => versionKey.split(":")[0]),
	);
	const selectedProductsCount = selectedProductIds.size;

	const handleSelectAll = (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		const allSelected =
			allProductVersions.length > 0 &&
			allProductVersions.every((pv) => selectedVersions.includes(pv.key));
		if (allSelected) {
			setFilters({ version: [], none: false });
		} else {
			setFilters({
				version: allProductVersions.map((pv) => pv.key),
				none: false,
			});
		}
		onChange?.();
	};

	const toggleProduct = (product: any) => {
		const versionCount = versionCounts?.[product.id] || 1;
		const productVersionKeys = Array.from(
			{ length: versionCount },
			(_, i) => `${product.id}:${i + 1}`,
		);

		const allProductVersionsSelected = productVersionKeys.every((key) =>
			selectedVersions.includes(key),
		);

		let newSelectedVersions: string[] = [];
		let newNone = queryStates.none;
		if (allProductVersionsSelected) {
			// Deselect all versions of this product
			newSelectedVersions = selectedVersions.filter(
				(key: string) => !productVersionKeys.includes(key),
			);
		} else {
			// Select all versions of this product
			const toAdd = productVersionKeys.filter(
				(key) => !selectedVersions.includes(key),
			);
			newSelectedVersions = [...selectedVersions, ...toAdd];
			newNone = false;
		}

		setFilters({ version: newSelectedVersions, none: newNone });
		onChange?.();
	};

	const toggleVersion = (productId: string, version: string) => {
		const versionKey = `${productId}:${version}`;
		const isSelected = selectedVersions.includes(versionKey);

		let newSelectedVersions: string[] = [];
		let newNone = queryStates.none;
		if (isSelected) {
			newSelectedVersions = selectedVersions.filter(
				(key: string) => key !== versionKey,
			);
		} else {
			newSelectedVersions = [...selectedVersions, versionKey];
			newNone = false;
		}

		setFilters({ version: newSelectedVersions, none: newNone });
		onChange?.();
	};

	const toggleCustom = (productId: string) => {
		const customKey = `${productId}:custom`;
		const isSelected = selectedVersions.includes(customKey);

		setFilters({
			version: isSelected
				? selectedVersions.filter((key: string) => key !== customKey)
				: [...selectedVersions, customKey],
			none: isSelected ? queryStates.none : false,
		});
		onChange?.();
	};

	const handleSelectNone = (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();

		setFilters({ version: [], none: !queryStates.none });
		onChange?.();
	};

	return (
		<DropdownMenuSub>
			<DropdownMenuSubTrigger className="flex items-center gap-2 cursor-pointer">
				Plans
				{hasSelections && (
					<span className="text-xs text-tertiary-foreground bg-muted px-1 py-0 rounded-md">
						{selectedProductsCount}
					</span>
				)}
			</DropdownMenuSubTrigger>
			<DropdownMenuSubContent className="w-64">
				{uniqueProducts.length === 0 ? (
					<div className="px-2 py-3 text-center text-tertiary-foreground text-sm">
						No products found
					</div>
				) : (
					<>
						<div className="flex items-center justify-between px-2 h-6">
							<button
								type="button"
								onClick={handleSelectAll}
								className={cn(
									"px-1 h-5 flex items-center gap-1 text-muted-foreground text-xs hover:text-foreground bg-accent cursor-pointer rounded-md",
									allProductVersions.length > 0 &&
										allProductVersions.every((pv) =>
											selectedVersions.includes(pv.key),
										) &&
										"bg-primary/10 text-primary hover:text-primary/80",
								)}
							>
								Select all
							</button>
							<button
								type="button"
								onClick={handleSelectNone}
								className={cn(
									"px-1 h-5 flex items-center gap-1 text-tertiary-foreground text-xs hover:text-foreground hover:bg-accent cursor-pointer rounded-md",
									queryStates.none &&
										"bg-primary/10 text-primary hover:text-primary/80",
								)}
							>
								No plans
							</button>
						</div>
						<DropdownMenuSeparator />

						<div className="max-h-64 overflow-y-auto">
							{uniqueProducts?.map((product: any) => {
								const versionCount = versionCounts?.[product.id] || 1;
								const productVersionKeys = Array.from(
									{ length: versionCount },
									(_, i) => `${product.id}:${i + 1}`,
								);
								const allProductVersionsSelected = productVersionKeys.every(
									(key) => selectedVersions.includes(key),
								);
								const someProductVersionsSelected = productVersionKeys.some(
									(key) => selectedVersions.includes(key),
								);
								const customSelected = selectedVersions.includes(
									`${product.id}:custom`,
								);

								return (
									<div key={product.id}>
										{versionCount === 1 ? (
											// Single version - show just one button for the product
											<DropdownMenuItem
												closeOnClick={false}
												onClick={(e) => {
													e.preventDefault();
													toggleVersion(product.id, "1");
												}}
												className="flex items-center gap-2 cursor-pointer font-medium"
											>
												<Checkbox
													checked={selectedVersions.includes(`${product.id}:1`)}
													className="border-border"
												/>
												<span className="truncate">{product.name}</span>
											</DropdownMenuItem>
										) : (
											// Multiple versions - show product name with hover submenu for versions
											<DropdownMenuSub>
												<DropdownMenuSubTrigger
													className="flex items-center gap-2 cursor-pointer font-medium"
													onClick={(e) => {
														e.preventDefault();
														toggleProduct(product);
													}}
												>
													<Checkbox
														checked={allProductVersionsSelected}
														className="border-border"
														ref={(ref: any) => {
															if (
																ref &&
																(someProductVersionsSelected ||
																	customSelected) &&
																!allProductVersionsSelected
															) {
																ref.indeterminate = true;
															}
														}}
													/>
													<span className="truncate">{product.name}</span>
												</DropdownMenuSubTrigger>
												<DropdownMenuSubContent>
													<DropdownMenuItem
														closeOnClick={false}
														onClick={(e) => {
															e.preventDefault();
															toggleProduct(product);
														}}
														className="flex items-center gap-2 cursor-pointer font-medium"
													>
														<Checkbox
															checked={allProductVersionsSelected}
															className="border-border"
														/>
														All Versions
													</DropdownMenuItem>
													<DropdownMenuSeparator />
													{Array.from(
														{ length: versionCount },
														(_, i) => i + 1,
													).map((version) => {
														const versionKey = `${product.id}:${version}`;
														const isVersionSelected =
															selectedVersions.includes(versionKey);

														return (
															<DropdownMenuItem
																key={versionKey}
																closeOnClick={false}
																onClick={(e) => {
																	e.preventDefault();
																	toggleVersion(product.id, version.toString());
																}}
																className="flex items-center gap-2 cursor-pointer text-sm"
															>
																<Checkbox
																	checked={isVersionSelected}
																	className="border-border"
																/>
																v{version}
															</DropdownMenuItem>
														);
													})}
													<DropdownMenuSeparator />
													<DropdownMenuItem
														closeOnClick={false}
														onClick={(e) => {
															e.preventDefault();
															toggleCustom(product.id);
														}}
														className="flex items-center gap-2 cursor-pointer text-sm"
													>
														<Checkbox
															checked={selectedVersions.includes(
																`${product.id}:custom`,
															)}
															className="border-border"
														/>
														Custom
													</DropdownMenuItem>
												</DropdownMenuSubContent>
											</DropdownMenuSub>
										)}
									</div>
								);
							})}
						</div>
					</>
				)}
			</DropdownMenuSubContent>
		</DropdownMenuSub>
	);
};
