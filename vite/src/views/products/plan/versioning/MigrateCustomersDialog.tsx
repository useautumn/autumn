import type { FrontendProduct } from "@autumn/shared";
import { productV2ToFrontendProduct } from "@autumn/shared";
import { UserIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { PlanItemsSection } from "@/components/forms/shared";
import { IconBadge } from "@/components/v2/badges/IconBadge";
import { ShortcutButton } from "@/components/v2/buttons/ShortcutButton";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/v2/dialogs/Dialog";
import { RadioGroup } from "@/components/v2/radio-groups/RadioGroup";
import { AreaRadioGroupItem } from "@/components/v2/radio-groups/AreaRadioGroupItem";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/v2/selects/Select";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useMigrationsQuery } from "@/hooks/queries/useMigrationsQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useOrg } from "@/hooks/common/useOrg";
import { getBackendErr, navigateTo } from "@/utils/genUtils";
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";
import {
	buildVersionMigrationDraft,
	type VersionMigrateScope,
} from "./buildMigrationDraft";
import { getPlanPriceChange, hasPlanMigrationDiff } from "./planMigrationDiff";

interface MigrateCustomersDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	productId: string;
	latestVersion: number;
	migratableVersions: number[];
	versionCounts: Record<
		number,
		{ active: number; canceled: number; custom: number; trialing: number }
	>;
}

export function useMigratableVersions({
	productId,
	latestVersion,
	pastVersions,
	currency,
}: {
	productId: string;
	latestVersion: number;
	pastVersions: number[];
	currency: string;
}) {
	const { products } = useProductsQuery({ allVersions: true });

	return useMemo(() => {
		const latest = products.find(
			(p) => p.id === productId && p.version === latestVersion,
		);
		if (!latest) return [];

		const latestProduct = productV2ToFrontendProduct({ product: latest });
		const versions: number[] = [];
		for (const p of products) {
			if (p.id !== productId) continue;
			if (!pastVersions.includes(p.version)) continue;
			if (
				hasPlanMigrationDiff({
					baseProduct: productV2ToFrontendProduct({ product: p }),
					product: latestProduct,
					currency,
				})
			) {
				versions.push(p.version);
			}
		}
		return versions.sort((a, b) => b - a);
	}, [products, productId, latestVersion, pastVersions, currency]);
}

function useVersionProducts(productId: string, versions: number[]) {
	const { products } = useProductsQuery({ allVersions: true });

	return useMemo(() => {
		const map = new Map<number, FrontendProduct>();
		for (const p of products) {
			if (p.id !== productId) continue;
			if (!versions.includes(p.version)) continue;
			map.set(p.version, productV2ToFrontendProduct({ product: p }));
		}
		return map;
	}, [products, productId, versions]);
}

function useLatestProduct(productId: string, latestVersion: number) {
	const { products } = useProductsQuery({ allVersions: true });

	return useMemo(() => {
		const p = products.find(
			(p) => p.id === productId && p.version === latestVersion,
		);
		return p ? productV2ToFrontendProduct({ product: p }) : undefined;
	}, [products, productId, latestVersion]);
}

function VersionDiff({
	fromProduct,
	toProduct,
	currency,
}: {
	fromProduct: FrontendProduct;
	toProduct: FrontendProduct;
	currency: string;
}) {
	const { features = [] } = useFeaturesQuery();
	const priceChange = getPlanPriceChange({
		baseProduct: fromProduct,
		product: toProduct,
		currency,
	});

	return (
		<PlanItemsSection
			product={toProduct}
			originalItems={fromProduct.items}
			features={features}
			prepaidOptions={{}}
			initialPrepaidOptions={{}}
			showDiff
			changesOnly
			currency={currency}
			onEditPlan={() => {}}
			priceChange={priceChange}
			readOnly
		/>
	);
}

export function MigrateCustomersDialog({
	open,
	onOpenChange,
	productId,
	latestVersion,
	migratableVersions,
	versionCounts,
}: MigrateCustomersDialogProps) {
	const navigate = useNavigate();
	const { createMigration, isCreating } = useMigrationsQuery();
	const { org } = useOrg();
	const currency = org?.default_currency ?? "USD";

	const [scope, setScope] = useState<VersionMigrateScope>("all");
	const [selectedVersion, setSelectedVersion] = useState<number | null>(null);

	const effectiveVersion =
		selectedVersion && migratableVersions.includes(selectedVersion)
			? selectedVersion
			: (migratableVersions[0] ?? null);

	const versionProducts = useVersionProducts(productId, migratableVersions);
	const latestProduct = useLatestProduct(productId, latestVersion);

	const selectedFromProduct =
		effectiveVersion !== null
			? (versionProducts.get(effectiveVersion) ?? null)
			: null;

	const versionSelectItems = Object.fromEntries(
		migratableVersions.map((v) => [String(v), `Version ${v}`]),
	);

	const handleCreate = async () => {
		if (migratableVersions.length === 0) return;

		const draft = buildVersionMigrationDraft({
			productId,
			latestVersion,
			scope,
			pastVersions: migratableVersions,
		});

		try {
			const migration = await createMigration(draft);

			toast.success("Migration created");
			onOpenChange(false);
			navigateTo(`/migrations/${migration.id}?step=live&run=true`, navigate);
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to create migration"));
		}
	};

	if (migratableVersions.length === 0) return null;

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => !isCreating && onOpenChange(next)}
		>
			<DialogContent className="max-w-md max-h-[85vh] flex flex-col">
				<DialogHeader>
					<DialogTitle>Migrate customers to v{latestVersion}</DialogTitle>
				</DialogHeader>

				<div className="overflow-y-auto min-h-0 flex-1">
					<DialogDescription asChild>
						<div className="text-sm flex flex-col gap-4">
							{migratableVersions.length > 1 && (
								<RadioGroup
									value={scope === "all" ? "all" : "specific"}
									onValueChange={(val) => {
										if (val === "all") {
											setScope("all");
										} else {
											setScope(selectedVersion);
										}
									}}
								>
									<AreaRadioGroupItem
										value="all"
										label={`Migrate all past versions to v${latestVersion}`}
										description={`Move all non-custom customers across ${migratableVersions.length} versions.`}
									/>
									<AreaRadioGroupItem
										value="specific"
										label="Migrate a specific version"
										description="Choose which version to migrate."
									/>
								</RadioGroup>
							)}

							<div className="flex flex-col gap-2">
								<span className="text-xs font-medium text-muted-foreground">
									Version
								</span>
								<Select
									value={
										effectiveVersion !== null
											? String(effectiveVersion)
											: undefined
									}
									onValueChange={(v) => {
										const num = Number(v);
										setSelectedVersion(num);
										if (scope !== "all") setScope(num);
									}}
									items={versionSelectItems}
								>
									<SelectTrigger className="w-full">
										<SelectValue placeholder="Select version" />
									</SelectTrigger>
									<SelectContent>
										{migratableVersions.map((version) => {
											const count =
												(versionCounts[version]?.active ?? 0) -
												(versionCounts[version]?.custom ?? 0);
											return (
												<SelectItem key={version} value={String(version)}>
													<div className="flex items-center justify-between w-full gap-3">
														<span>Version {version}</span>
														<IconBadge variant="muted" icon={<UserIcon />}>
															{count}
														</IconBadge>
													</div>
												</SelectItem>
											);
										})}
									</SelectContent>
								</Select>
							</div>

							{selectedFromProduct && latestProduct && (
								<div className="flex flex-col gap-2">
									<span className="text-xs font-medium text-muted-foreground">
										Changes from v{effectiveVersion} → v{latestVersion}
									</span>
									<VersionDiff
										fromProduct={selectedFromProduct}
										toProduct={latestProduct}
										currency={currency}
									/>
								</div>
							)}

							<InfoBox variant="info">
								Customers on custom plans will not be migrated.
							</InfoBox>
						</div>
					</DialogDescription>
				</div>

				<DialogFooter>
					<ShortcutButton
						variant="primary"
						metaShortcut="enter"
						onClick={handleCreate}
						isLoading={isCreating}
						disabled={isCreating}
						className="w-full"
					>
						Preview Migration
					</ShortcutButton>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
