import type { FrontendProduct } from "@autumn/shared";
import { isPriceItem, productsAreSame } from "@autumn/shared";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { PlanItemsSection } from "@/components/forms/shared";
import { getProductPriceDisplay } from "@/components/forms/update-subscription-v2/components/PriceDisplay";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/v2/buttons/Button";
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
	const [includeCustom, setIncludeCustom] = useState(false);
	const [confirmText, setConfirmText] = useState("");
	const [isLoading, setIsLoading] = useState(false);

	const confirmed = confirmText === product.id;

	const currency = org?.default_currency ?? "USD";
	const priceChange = usePriceChange(baseProduct, product, currency);
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

	const resetState = () => {
		setStep(1);
		setVersionChoice("new");
		setMigrationScope("all_customers");
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

	const discardEdits = () => {
		if (baseProduct) setProduct(baseProduct);
	};

	const handleStep1Action = async () => {
		if (!confirmed) {
			toast.error("Confirmation text is incorrect");
			return;
		}

		if (versionChoice === "update") {
			setStep(2);
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
		if (!baseProduct) return;

		setIsLoading(true);
		try {
			const scope = hasMultipleVersions
				? migrationScope
				: "this_version";

			const draft = buildMigrationDraft({
				baseProduct,
				editedProduct: product,
				features,
				scope,
				includeCustom,
			});

			discardEdits();

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
			navigateTo(
				`/migrations/${migration.id}?step=live&run=true`,
				navigate,
			);
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
				: "Update existing version"
			: "Create migration";

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="max-w-md max-h-[85vh] flex flex-col">
				<DialogHeader>
					<DialogTitle>
						{step === 1
							? "Save plan changes"
							: "Create migration"}
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
											originalItems={
												baseProduct?.items
											}
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
										setVersionChoice(
											val as VersionChoice,
										)
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
											description="Apply these changes to existing customers via a migration."
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
									{hasMultipleVersions && (
									<RadioGroup
										className="pt-1 pb-3"
										value={migrationScope}
										onValueChange={(val) =>
											setMigrationScope(
												val as MigrationScope,
											)
										}
									>
											<AreaRadioGroupItem
												value="all_customers"
												label="Update all customers"
												description="Apply changes to customers on any version of this plan."
											/>
											<AreaRadioGroupItem
												value="this_version"
												label={`Update customers on v${baseProduct?.version ?? 1} only`}
												description="Only apply changes to customers on this specific version."
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
													There{" "}
													{customCount === 1
														? "is"
														: "are"}{" "}
													{customCount} user
													{customCount !== 1
														? "s"
														: ""}{" "}
													on custom versions of
													this plan
												</span>
											</div>
											<Switch
												checked={includeCustom}
												onCheckedChange={
													setIncludeCustom
												}
											/>
										</div>
									)}

									{!hasMultipleVersions &&
										customCount === 0 && (
											<p className="text-sm text-muted-foreground">
												This will create a migration
												to apply your changes to all
												customers on this plan.
											</p>
										)}
								</>
							)}
						</div>
					</DialogDescription>
				</div>

				<DialogFooter>
					{step === 2 && (
						<Button
							variant="secondary"
							onClick={() => setStep(1)}
							disabled={isLoading}
						>
							Back
						</Button>
					)}
					<ShortcutButton
						variant="primary"
						metaShortcut="enter"
						onClick={
							step === 1
								? handleStep1Action
								: handleStep2Action
						}
						isLoading={isLoading}
						disabled={
							isLoading ||
							(step === 1 && !confirmed)
						}
						className="w-full"
					>
						{buttonText}
					</ShortcutButton>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
