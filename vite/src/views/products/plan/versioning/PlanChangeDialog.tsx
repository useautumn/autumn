import type { FrontendProduct } from "@autumn/shared";
import { isPriceItem, productsAreSame } from "@autumn/shared";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { PlanItemsSection } from "@/components/forms/shared";
import { getProductPriceDisplay } from "@/components/forms/update-subscription-v2/components/PriceDisplay";
import { Switch } from "@/components/ui/switch";
import { ShortcutButton } from "@/components/v2/buttons/ShortcutButton";
import { MiniCopyButton } from "@/components/v2/buttons/CopyButton";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/v2/dialogs/Dialog";
import { Input } from "@/components/v2/inputs/Input";
import { RadioGroup } from "@/components/v2/radio-groups/RadioGroup";
import { AreaRadioGroupItem } from "@/components/v2/radio-groups/AreaRadioGroupItem";
import { useOrg } from "@/hooks/common/useOrg";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useMigrationsQuery } from "@/hooks/queries/useMigrationsQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useProductStore } from "@/hooks/stores/useProductStore";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr, navigateTo } from "@/utils/genUtils";
import {
	useProductQuery,
	useProductQueryState,
} from "../../product/hooks/useProductQuery";
import { updateProduct } from "../../product/utils/updateProduct";
import {
	buildMigrationDraft,
	type MigrationScope,
} from "./buildMigrationDraft";

type MigrationChoice = "keep" | MigrationScope;

function usePriceChange(
	baseProduct: FrontendProduct | null,
	product: FrontendProduct,
	currency: string,
) {
	return useMemo(() => {
		if (!baseProduct) return null;

		const oldDisplay = getProductPriceDisplay({
			product: baseProduct,
			currency,
		});
		const newDisplay = getProductPriceDisplay({ product, currency });

		const oldPrice =
			oldDisplay.type === "price" ? oldDisplay.formattedPrice : "Free";
		const newPrice =
			newDisplay.type === "price" ? newDisplay.formattedPrice : "Free";
		const oldInterval =
			oldDisplay.type === "price" ? oldDisplay.intervalText : null;
		const newInterval =
			newDisplay.type === "price" ? newDisplay.intervalText : null;

		if (oldPrice === newPrice && oldInterval === newInterval) return null;

		const originalPriceItem = baseProduct.items?.find((i) => isPriceItem(i));
		const currentPriceItem = product.items?.find((i) => isPriceItem(i));

		return {
			oldPrice,
			newPrice,
			oldIntervalText: oldInterval !== newInterval ? oldInterval : null,
			newIntervalText: newInterval,
			isUpgrade:
				(currentPriceItem?.price ?? 0) > (originalPriceItem?.price ?? 0),
		};
	}, [baseProduct, product.items, currency]);
}

export default function PlanChangeDialog({
	open,
	setOpen,
}: {
	open: boolean;
	setOpen: (open: boolean) => void;
}) {
	const axiosInstance = useAxiosInstance();
	const navigate = useNavigate();
	const product = useProductStore((s) => s.product);
	const baseProduct = useProductStore((s) => s.baseProduct);
	const setBaseProduct = useProductStore((s) => s.setBaseProduct);
	const setProduct = useProductStore((s) => s.setProduct);
	const { features = [] } = useFeaturesQuery();
	const { refetch } = useProductQuery();
	const { setQueryStates } = useProductQueryState();
	const { invalidate: invalidateProducts } = useProductsQuery();
	const { createMigration, invalidate: invalidateMigrations } =
		useMigrationsQuery();
	const { org } = useOrg();

	const [confirmText, setConfirmText] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [createVersion, setCreateVersion] = useState(true);
	const [migrationChoice, setMigrationChoice] =
		useState<MigrationChoice>("keep");

	const currency = org?.default_currency ?? "USD";
	const priceChange = usePriceChange(baseProduct, product, currency);
	const { products } = useProductsQuery();
	const latestVersion = products.find((p) => p.id === product.id)?.version;
	const hasMultipleVersions = (latestVersion ?? 1) > 1;

	const hasChanges = useMemo(() => {
		if (!baseProduct || features.length === 0) return false;
		const { same } = productsAreSame({
			curProductV2: baseProduct,
			newProductV2: product,
			features,
		});
		return !same;
	}, [baseProduct, product, features]);

	const confirmed = confirmText === product.id;

	let effectiveMigrationScope: MigrationScope | null;
	if (migrationChoice !== "keep") {
		effectiveMigrationScope = migrationChoice;
	} else {
		effectiveMigrationScope = createVersion ? null : "this_version";
	}

	const willCreateMigration = effectiveMigrationScope !== null;

	const resetState = () => {
		setConfirmText("");
		setCreateVersion(true);
		setMigrationChoice("keep");
	};

	const syncToLatestVersion = async () => {
		await setQueryStates({ version: null });
		await refetch();
		invalidateProducts();
	};

	const markSaved = () => {
		setBaseProduct(product as FrontendProduct);
	};

	const discardEdits = () => {
		if (baseProduct) setProduct(baseProduct);
	};

	const handleSave = async () => {
		if (!confirmed) {
			toast.error("Confirmation text is incorrect");
			return;
		}
		if (!baseProduct) return;

		setIsLoading(true);

		try {
			if (createVersion) {
				const result = await updateProduct({
					axiosInstance,
					productId: product.id,
					product,
					version: product.version,
					onSuccess: async () => {
						invalidateProducts();
					},
				});

				if (!result) return;
				markSaved();
			} else {
				discardEdits();
			}

			if (!effectiveMigrationScope) {
				toast.success("New version created");
				setOpen(false);
				resetState();
				syncToLatestVersion();
				return;
			}

			const draft = buildMigrationDraft({
				baseProduct,
				editedProduct: product,
				features,
				scope: effectiveMigrationScope,
			});

			const migration = await createMigration({
				id: draft.id,
				filter: draft.filter,
				operations: draft.operations,
				no_billing_changes: draft.no_billing_changes,
			});

			await invalidateMigrations();

			toast.success(
				createVersion
					? "New version created with migration"
					: "Migration created",
			);
			setOpen(false);
			resetState();
			navigateTo(
				`/migrations/${migration.id}?step=live&run=true`,
				navigate,
			);
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to save plan"));
		} finally {
			setIsLoading(false);
		}
	};

	const handleOpenChange = (nextOpen: boolean) => {
		if (!isLoading) {
			setOpen(nextOpen);
			if (!nextOpen) {
				resetState();
				if (createVersion) syncToLatestVersion();
			}
		}
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="max-w-md max-h-[85vh] flex flex-col">
				<DialogHeader>
					<DialogTitle>Save plan changes</DialogTitle>
				</DialogHeader>

				<div className="overflow-y-auto min-h-0 flex-1">
					<DialogDescription asChild>
						<div className="text-sm flex flex-col gap-6">
							{hasChanges && (
								<PlanItemsSection
									product={product}
									originalItems={baseProduct?.items}
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
							)}

							<div className="flex items-center justify-between gap-4">
								<div className="flex flex-col gap-0.5">
									<span className="text-sm font-medium text-foreground">
										Create a new plan version
									</span>
									<span className="text-xs text-muted-foreground">
										New customers will get this version.
										Disable to update existing customers
										only.
									</span>
								</div>
								<Switch
									checked={createVersion}
									onCheckedChange={setCreateVersion}
								/>
							</div>

							<div className="flex flex-col gap-3">
								<p className="text-sm font-medium text-foreground">
									Existing customers
								</p>
								<RadioGroup
									value={migrationChoice}
									onValueChange={(val) =>
										setMigrationChoice(val as MigrationChoice)
									}
								>
									{createVersion && (
										<AreaRadioGroupItem
											value="keep"
											label="Keep as they are"
											description="Existing customers stay on their current version."
										/>
									)}
									<AreaRadioGroupItem
										value="this_version"
										label={`Apply changes to customers on v${baseProduct?.version ?? 1}`}
										description="Create a migration to apply these changes to customers on this version."
									/>
									{hasMultipleVersions && (
										<AreaRadioGroupItem
											value="all_customers"
											label="Apply changes to all customers"
											description="Create a migration to apply these changes to all customers on this plan."
										/>
									)}
								</RadioGroup>
							</div>

							<div className="flex flex-col gap-2">
								<div className="flex items-center gap-1 flex-wrap">
									<span>Type</span>
									<MiniCopyButton
										text={product.id}
										innerClassName="font-mono font-bold text-foreground"
										iconClassName="opacity-100 text-muted-foreground hover:text-foreground transition-colors"
									/>
									<span>to continue.</span>
								</div>

								<Input
									value={confirmText}
									onChange={(e) => setConfirmText(e.target.value)}
									type="text"
									placeholder={product.id}
									className="w-full"
								/>
							</div>
						</div>
					</DialogDescription>
				</div>

				<DialogFooter>
					<ShortcutButton
						variant="primary"
						metaShortcut="enter"
						onClick={handleSave}
						isLoading={isLoading}
						disabled={isLoading || !confirmed}
						className="w-full"
					>
						{willCreateMigration ? "Preview Migration" : "Save changes"}
					</ShortcutButton>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
