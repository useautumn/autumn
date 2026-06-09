import type { FrontendProduct } from "@autumn/shared";
import { productsAreSame } from "@autumn/shared";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { PlanItemsSection } from "@/components/forms/shared";
import { Switch } from "@/components/ui/switch";
import { ShortcutButton } from "@/components/v2/buttons/ShortcutButton";
import { MiniCopyButton } from "@/components/v2/buttons/CopyButton";
import { Input } from "@/components/v2/inputs/Input";
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
import { useOrg } from "@/hooks/common/useOrg";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useMigrationsQuery } from "@/hooks/queries/useMigrationsQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useProductStore } from "@/hooks/stores/useProductStore";
import { ProductService } from "@/services/products/ProductService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr, navigateTo } from "@/utils/genUtils";
import {
	useProductQuery,
	useProductQueryState,
} from "../../product/hooks/useProductQuery";
import { updateProduct } from "../../product/utils/updateProduct";
import {
	buildInPlaceUpdatePlanParams,
	buildMigrationDraft,
	type MigrationScope,
} from "./buildMigrationDraft";
import { getPlanPriceChange, hasPlanMigrationDiff } from "./planMigrationDiff";

type VersionChoice = "new" | "update";

function ConfirmInput({
	productId,
	value,
	onChange,
}: {
	productId: string;
	value: string;
	onChange: (value: string) => void;
}) {
	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center gap-1 flex-wrap">
				<span>Type</span>
				<MiniCopyButton
					text={productId}
					innerClassName="font-mono font-bold text-foreground"
					iconClassName="opacity-100 text-muted-foreground hover:text-foreground transition-colors"
				/>
				<span>to continue.</span>
			</div>
			<Input
				value={value}
				onChange={(e) => onChange(e.target.value)}
				type="text"
				placeholder={productId}
				className="w-full"
			/>
		</div>
	);
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
	const { features = [] } = useFeaturesQuery();
	const { refetch, numVersions, versionCounts } = useProductQuery();
	const { setQueryStates } = useProductQueryState();
	const { invalidate: invalidateProducts } = useProductsQuery();
	const { createMigration, invalidate: invalidateMigrations } =
		useMigrationsQuery();
	const { org } = useOrg();

	const [step, setStep] = useState<1 | 2>(1);
	const [versionChoice, setVersionChoice] = useState<VersionChoice>("new");
	const [migrationScope, setMigrationScope] =
		useState<MigrationScope>("all_customers");
	const [migrationBaseProduct, setMigrationBaseProduct] =
		useState<FrontendProduct | null>(null);
	const [includeCustom, setIncludeCustom] = useState(false);
	const [confirmText, setConfirmText] = useState("");
	const [isLoading, setIsLoading] = useState(false);

	const confirmed = confirmText === product.id;

	const currency = org?.default_currency ?? "USD";
	const priceChange = useMemo(
		() => getPlanPriceChange({ baseProduct, product, currency }),
		[baseProduct, product, currency],
	);
	const hasMultipleVersions = (numVersions ?? 1) > 1;

	const customCount = useMemo(() => {
		return Object.values(versionCounts).reduce(
			(sum, vc) => sum + (vc.custom ?? 0),
			0,
		);
	}, [versionCounts]);

	const hasChanges = useMemo(() => {
		if (!baseProduct || features.length === 0) return false;
		const { same } = productsAreSame({
			curProductV2: baseProduct,
			newProductV2: product,
			features,
		});
		return !same;
	}, [baseProduct, product, features]);
	const hasMigrationDiff = useMemo(() => {
		return hasPlanMigrationDiff({ baseProduct, product, currency });
	}, [baseProduct, product, currency]);

	const resetState = () => {
		setStep(1);
		setVersionChoice("new");
		setMigrationScope("all_customers");
		setMigrationBaseProduct(null);
		setIncludeCustom(false);
		setConfirmText("");
	};

	const syncToLatestVersion = async () => {
		await setQueryStates({ version: null });
		await refetch();
		invalidateProducts();
	};

	const markSaved = () => {
		setBaseProduct(product as FrontendProduct);
	};

	const handleStep1Action = async () => {
		if (!confirmed) {
			toast.error("Confirmation text is incorrect");
			return;
		}

		if (versionChoice === "update") {
			if (!baseProduct) return;
			if (product.id !== baseProduct.id) {
				toast.error(
					"Plan IDs cannot be changed when updating the current version",
				);
				return;
			}

			setIsLoading(true);
			try {
				await ProductService.updatePlan(
					axiosInstance,
					buildInPlaceUpdatePlanParams({
						baseProduct,
						editedProduct: product,
						features,
					}),
				);
				markSaved();
				toast.success("Plan updated");
				if (hasMigrationDiff) {
					setMigrationBaseProduct(baseProduct);
					setStep(2);
				} else {
					setOpen(false);
					resetState();
					void refetch();
				}
				void invalidateProducts();
			} catch (error) {
				toast.error(getBackendErr(error, "Failed to update plan"));
			} finally {
				setIsLoading(false);
			}
			return;
		}

		setIsLoading(true);
		try {
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
			toast.success("New version created");
			setOpen(false);
			resetState();
			syncToLatestVersion();
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to save plan"));
		} finally {
			setIsLoading(false);
		}
	};

	const handleStep2Action = async () => {
		const draftBaseProduct = migrationBaseProduct ?? baseProduct;
		if (!draftBaseProduct) return;
		if (
			!hasPlanMigrationDiff({
				baseProduct: draftBaseProduct,
				product,
				currency,
			})
		) {
			setOpen(false);
			resetState();
			void refetch();
			void invalidateProducts();
			return;
		}

		setIsLoading(true);
		try {
			const scope = hasMultipleVersions ? migrationScope : "this_version";

			const draft = buildMigrationDraft({
				baseProduct: draftBaseProduct,
				editedProduct: product,
				features,
				scope,
				includeCustom,
			});

			const migration = await createMigration({
				id: draft.id,
				filter: draft.filter,
				operations: draft.operations,
				no_billing_changes: draft.no_billing_changes,
			});

			await invalidateMigrations();
			toast.success("Migration created");
			setOpen(false);
			resetState();
			navigateTo(`/migrations/${migration.id}?step=live&run=true`, navigate);
			void refetch();
			void invalidateProducts();
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to create migration"));
		} finally {
			setIsLoading(false);
		}
	};

	const handleOpenChange = (nextOpen: boolean) => {
		if (!isLoading) {
			setOpen(nextOpen);
			if (!nextOpen) resetState();
		}
	};

	const buttonText =
		step === 1
			? versionChoice === "new"
				? "Create new version"
				: "Update plan"
			: "Preview migration";

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="max-w-md max-h-[85vh] flex flex-col">
				<DialogHeader>
					<DialogTitle>
						{step === 1 ? "Save plan changes" : "Create migration"}
					</DialogTitle>
				</DialogHeader>

				<div className="overflow-y-auto min-h-0 flex-1">
					<DialogDescription asChild>
						<div className="text-sm flex flex-col gap-6">
							{step === 1 && (
								<>
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

									<RadioGroup
										className="pt-1 pb-3"
										value={versionChoice}
										onValueChange={(val) =>
											setVersionChoice(val as VersionChoice)
										}
									>
										<AreaRadioGroupItem
											value="new"
											label="Create new version"
											description="Existing customers stay on their current version."
										/>
										<AreaRadioGroupItem
											value="update"
											label="Update existing version"
											description="Update the current plan version now. After that, you can preview a migration for current users."
										/>
									</RadioGroup>

									<ConfirmInput
										productId={product.id}
										value={confirmText}
										onChange={setConfirmText}
									/>
								</>
							)}

							{step === 2 && (
								<>
									<p className="text-sm text-muted-foreground">
										Autumn updated the current version of this plan directly.
										New customers will get these changes immediately. Now create
										a migration so you can review and apply the same changes to
										current users.
									</p>

									{hasMultipleVersions && (
										<RadioGroup
											className="pt-1 pb-3"
											value={migrationScope}
											onValueChange={(val) =>
												setMigrationScope(val as MigrationScope)
											}
										>
											<AreaRadioGroupItem
												value="all_customers"
												label="Update all customers"
												description="Preview a migration for current users on any version of this plan."
											/>
											<AreaRadioGroupItem
												value="this_version"
												label={`Update customers on v${migrationBaseProduct?.version ?? baseProduct?.version ?? 1} only`}
												description="Preview a migration only for current users on this specific version."
											/>
										</RadioGroup>
									)}

									{customCount > 0 && (
										<div className="flex items-center justify-between gap-4">
											<div className="flex flex-col gap-0.5">
												<span className="text-sm font-medium text-foreground">
													Apply to custom plans
												</span>
												<span className="text-xs text-muted-foreground">
													There {customCount === 1 ? "is" : "are"} {customCount}{" "}
													user
													{customCount !== 1 ? "s" : ""} on custom versions of
													this plan
												</span>
											</div>
											<Switch
												checked={includeCustom}
												onCheckedChange={setIncludeCustom}
											/>
										</div>
									)}

									{!hasMultipleVersions && customCount === 0 && (
										<p className="text-sm text-muted-foreground">
											Preview a migration for current users on this plan.
										</p>
									)}
								</>
							)}
						</div>
					</DialogDescription>
				</div>

				<DialogFooter>
					<ShortcutButton
						variant="primary"
						metaShortcut="enter"
						onClick={step === 1 ? handleStep1Action : handleStep2Action}
						isLoading={isLoading}
						disabled={isLoading || (step === 1 && !confirmed)}
						className="w-full"
					>
						{buttonText}
					</ShortcutButton>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
