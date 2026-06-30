import type { FrontendProduct, PlanUpdatePreview } from "@autumn/shared";
import {
	AreaRadioGroupItem,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Input,
	MiniCopyButton,
	RadioGroup,
	ShortcutButton,
	Switch,
} from "@autumn/ui";
import {
	GitForkIcon,
	SealCheckIcon,
	SlidersIcon,
	StackIcon,
} from "@phosphor-icons/react";
import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { PlanPriceHeader } from "@/components/forms/shared/plan-items/PlanPriceHeader";
import { ItemChangeList } from "@/components/v2/ItemChangeList";
import { LAYOUT_TRANSITION } from "@/components/v2/sheets/SharedSheetComponents";
import { useOrg } from "@/hooks/common/useOrg";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useMigrationsQuery } from "@/hooks/queries/useMigrationsQuery";
import { usePlanUpdatePreview } from "@/hooks/queries/usePlanUpdatePreview";
import { usePlanVariants } from "@/hooks/queries/usePlanVariants";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useProductStore } from "@/hooks/stores/useProductStore";
import { useMeasuredHeight } from "@/hooks/useMeasuredHeight";
import { ProductService } from "@/services/products/ProductService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr, navigateTo } from "@/utils/genUtils";
import {
	useProductQuery,
	useProductQueryState,
} from "../../product/hooks/useProductQuery";
import {
	type AllVersionsUpdateMigrationTarget,
	buildInPlaceUpdatePlanParams,
	buildPreviewUpdatePlanParams,
} from "./buildMigrationDraft";
import { buildMigrateTargets, MigrateTargetsStep } from "./MigrateTargetsStep";
import {
	PlanSettingsChanges,
	previousAttributesToSettingChanges,
} from "./PlanSettingsChanges";
import { PropagateVariantsStep } from "./PropagateVariantsStep";
import { getPlanPriceChange } from "./planMigrationDiff";
import { Stepper, type StepperStep } from "./Stepper";
import type { VariantConflictInfo } from "./variantConflicts";

type VersionChoice = "new" | "update" | "all";
type StepKey = "review" | "scope" | "strategy" | "migrate";

function FieldLabel({ children }: { children: React.ReactNode }) {
	return (
		<span className="text-[13px] font-medium text-foreground">{children}</span>
	);
}

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
		<div className="flex flex-col gap-2 text-sm">
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

const previewHasCustomersAcrossVersions = ({
	preview,
}: {
	preview: Pick<PlanUpdatePreview, "has_customers" | "other_versions">;
}) =>
	preview.has_customers ||
	(preview.other_versions ?? []).some((version) => version.has_customers);

// Only item/price changes move existing customers; free-trial and billing-
// controls edits version without a migration. Sourced from the backend preview.
const entryHasMigratableDiff = (
	entry: Pick<PlanUpdatePreview, "item_changes" | "price_change"> | undefined,
) => (entry?.item_changes?.length ?? 0) > 0 || entry?.price_change !== undefined;

const collectAllVersionMigrationTargets = ({
	preview,
	selectedVariantIds,
}: {
	preview: PlanUpdatePreview | undefined;
	selectedVariantIds: string[];
}): AllVersionsUpdateMigrationTarget[] => {
	if (!preview) return [];

	const targets: AllVersionsUpdateMigrationTarget[] = [];
	if (
		entryHasMigratableDiff(preview) &&
		previewHasCustomersAcrossVersions({ preview })
	) {
		targets.push({ id: preview.plan_id, customize: preview.customize });
	}

	for (const variantId of selectedVariantIds) {
		const variantRows = preview.variants.filter(
			(variant) => variant.plan_id === variantId,
		);
		const variantPreview = variantRows[0];
		if (
			variantPreview &&
			entryHasMigratableDiff(variantPreview) &&
			variantRows.some((row) => row.has_customers)
		) {
			targets.push({
				id: variantPreview.plan_id,
				customize: variantPreview.customize,
			});
		}
	}

	return targets;
};

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
	const {
		refetch,
		invalidate: invalidateProduct,
		versionCounts,
		numVersions,
	} = useProductQuery();
	const { setQueryStates } = useProductQueryState();
	const { invalidate: invalidateProducts } = useProductsQuery();
	const { invalidate: invalidateMigrations } = useMigrationsQuery();
	const { org } = useOrg();

	const [step, setStep] = useState<StepKey>("review");
	const [versionChoice, setVersionChoice] = useState<VersionChoice>("new");
	const [includeCustom, setIncludeCustom] = useState(false);
	const [confirmText, setConfirmText] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [selectedVariantIds, setSelectedVariantIds] = useState<string[]>([]);
	const { ref: bodyRef, height: bodyHeight } =
		useMeasuredHeight<HTMLDivElement>();

	const confirmed = confirmText === product.id;
	const currency = org?.default_currency ?? "USD";

	const priceChange = useMemo(
		() => getPlanPriceChange({ baseProduct, product, currency }),
		[baseProduct, product, currency],
	);

	// Preview the in-place update so versioning, customer impact, item changes
	// and variant conflicts come from the backend.
	const previewParams = useMemo(
		() =>
			buildPreviewUpdatePlanParams({
				baseProduct,
				editedProduct: product,
				features,
			}),
		[baseProduct, product, features],
	);

	const { data: preview } = usePlanUpdatePreview({
		planId: product.id,
		params: previewParams,
		enabled: open,
	});
	const hasHistoricalVersions =
		(preview?.other_versions?.length ?? 0) > 0 ||
		(preview?.variants ?? []).some(
			(variant) => (variant.other_versions?.length ?? 0) > 0,
		);

	const settingsChanges = useMemo(
		() => previousAttributesToSettingChanges(preview?.previous_attributes),
		[preview],
	);
	// customize holds the items/price/trial diff; billing_controls is versionable
	// too but isn't in customize, so read it from previous_attributes. Everything
	// else is metadata.
	const billingControlsChanged =
		!!preview?.previous_attributes &&
		"billing_controls" in preview.previous_attributes;
	const isVersionableChange = !!preview?.customize || billingControlsChanged;
	const isMetadataOnly = !!preview && !isVersionableChange;

	const customCount = useMemo(
		() =>
			Object.values(versionCounts).reduce(
				(sum, vc) => sum + (vc.custom ?? 0),
				0,
			),
		[versionCounts],
	);

	// The latest version is numVersions; older versions can't patch variants at a
	// matching version, so "update this version" never propagates to them.
	const isLatest = product.version >= numVersions;
	const { data: variants = [] } = usePlanVariants(product.id, open);
	const hasVariants = variants.length > 0;
	// Scope (variant selection) shows on the latest version, and on any version
	// when applying to all versions — both propagate to variants. Metadata-only
	// edits skip it (they fan out to all variants via the settings patch).
	const showScope =
		!isMetadataOnly && hasVariants && (isLatest || versionChoice === "all");
	const effectiveVariantIds = useMemo(
		() => (showScope ? selectedVariantIds : []),
		[showScope, selectedVariantIds],
	);

	// Only item/price changes are migratable; billing-controls and free-trial
	// edits version without ever moving existing customers.
	const hasMigratableDiff = entryHasMigratableDiff(preview);
	// Patch-in-place applies the change to the loaded version, so its existing
	// customers need a migration. New-version intentionally grandfathers.
	const baseNeedsMigration = versionChoice === "update" && hasMigratableDiff;
	const allVersionsMigrationTargets = useMemo(
		() =>
			versionChoice === "all"
				? collectAllVersionMigrationTargets({
						preview,
						selectedVariantIds: effectiveVariantIds,
					})
				: [],
		[versionChoice, preview, effectiveVariantIds],
	);

	const variantConflicts = useMemo<VariantConflictInfo[]>(
		() =>
			variants.map((variant) => {
				const previewVariant =
					preview?.variants.find(
						(v) =>
							v.plan_id === variant.id && v.version === variant.latest_version,
					) ?? preview?.variants.find((v) => v.plan_id === variant.id);
				return {
					variant,
					conflicts: previewVariant?.conflicts ?? [],
					itemChanges: previewVariant?.item_changes ?? [],
				};
			}),
		[variants, preview],
	);

	// Default-select only conflict-free variants once both variants and the
	// preview (which carries conflicts) have loaded.
	const variantSelectionInit = useRef(false);
	useEffect(() => {
		if (!open) {
			variantSelectionInit.current = false;
			return;
		}
		if (!variantSelectionInit.current && variants.length > 0 && preview) {
			setSelectedVariantIds(
				variantConflicts
					.filter((v) => v.conflicts.length === 0)
					.map((v) => v.variant.id),
			);
			variantSelectionInit.current = true;
		}
	}, [open, variants, preview, variantConflicts]);

	// Metadata-only edits always apply across all versions; there's no strategy
	// step, so pin the choice.
	useEffect(() => {
		if (isMetadataOnly && versionChoice !== "all") setVersionChoice("all");
	}, [isMetadataOnly, versionChoice]);

	// "Create new version" isn't offered for a past version, so fall back to
	// updating in place (also corrects once numVersions resolves).
	useEffect(() => {
		if (!(isMetadataOnly || isLatest) && versionChoice === "new") {
			setVersionChoice("update");
		}
	}, [isMetadataOnly, isLatest, versionChoice]);

	// New grandfathers everyone; update/all patch live versions, so their
	// existing customers are migration targets. Variants only migrate when
	// there's a migratable diff to push (not for billing-controls-only edits).
	const migrateNeeded =
		(versionChoice === "update" &&
			(baseNeedsMigration ||
				(effectiveVariantIds.length > 0 && hasMigratableDiff))) ||
		allVersionsMigrationTargets.length > 0;

	const migrateTargets = useMemo(() => {
		if (!preview) return [];
		return buildMigrateTargets({
			preview,
			selectedVariantIds: effectiveVariantIds,
			versionChoice,
			currentVersion: product.version,
			baseName: product.name ?? product.id,
		});
	}, [preview, effectiveVariantIds, versionChoice, product]);

	const steps: StepperStep[] = useMemo(
		() => [
			{ key: "review", label: "Changes", icon: SlidersIcon },
			...(isMetadataOnly
				? []
				: [{ key: "strategy", label: "Versions", icon: StackIcon }]),
			...(showScope
				? [{ key: "scope", label: "Variants", icon: GitForkIcon }]
				: []),
			{ key: "migrate", label: "Review", icon: SealCheckIcon },
		],
		[showScope, isMetadataOnly],
	);
	const stepKeys = steps.map((s) => s.key as StepKey);
	const currentIndex = stepKeys.indexOf(step);
	const isFinalStep = currentIndex === stepKeys.length - 1;

	const resetState = () => {
		setStep("review");
		setVersionChoice(isLatest ? "new" : "update");
		setIncludeCustom(false);
		setConfirmText("");
		setSelectedVariantIds([]);
	};

	const syncToLatestVersion = async () => {
		await setQueryStates({ version: null });
		await refetch();
		await Promise.all([invalidateProduct(), invalidateProducts()]);
	};

	const markSaved = () => setBaseProduct(product as FrontendProduct);

	const closeDialog = () => {
		setOpen(false);
		resetState();
	};

	// Apply the base edit (in-place, new version, or all versions) + propagate to
	// selected variants. plans.update creates the migration server-side.
	const applyChanges = async ({ migrate }: { migrate: boolean }) => {
		// Type-to-confirm only gates the migration step (the only point where
		// existing customers are moved). Lower-impact applies skip it.
		if (step === "migrate" && !confirmed) {
			toast.error("Confirmation text is incorrect");
			return;
		}
		setIsLoading(true);
		try {
			const willMigrate = migrateNeeded && migrate;
			let updateParams: ReturnType<typeof buildInPlaceUpdatePlanParams>;
			if (versionChoice === "update" || versionChoice === "all") {
				if (!baseProduct) return;
				if (product.id !== baseProduct.id) {
					throw new Error(
						"Plan IDs cannot be changed when updating the current version",
					);
				}
				updateParams = buildInPlaceUpdatePlanParams({
					baseProduct,
					editedProduct: product,
					features,
				});
				if (versionChoice === "all") {
					delete updateParams.disable_version;
					updateParams.all_versions = true;
				}
			} else {
				updateParams = buildInPlaceUpdatePlanParams({
					baseProduct: baseProduct ?? product,
					editedProduct: product,
					features,
				});
				delete updateParams.disable_version;
			}
			if (effectiveVariantIds.length > 0) {
				updateParams.update_variant_ids = effectiveVariantIds;
			}
			if (willMigrate) {
				updateParams.migration = {
					draft: true,
					include_custom: includeCustom,
				};
			}

			const result = await ProductService.updatePlan(
				axiosInstance,
				updateParams,
			);
			markSaved();
			toast.success(
				versionChoice === "new"
					? "New version created"
					: versionChoice === "all"
						? "All versions updated"
						: "Plan updated",
			);
			void invalidateProduct();
			void invalidateProducts();
			closeDialog();
			if (versionChoice === "new") void syncToLatestVersion();
			else void refetch();

			if (willMigrate) {
				void invalidateMigrations();
				const migrationId = (
					result as { migration?: { id?: string } } | undefined
				)?.migration?.id;
				navigateTo(
					migrationId
						? `/migrations/${migrationId}?step=live&run=true`
						: "/migrations",
					navigate,
				);
			}
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to save plan"));
		} finally {
			setIsLoading(false);
		}
	};

	const advance = () => {
		if (!isFinalStep) {
			setStep(stepKeys[currentIndex + 1]);
			return;
		}
		void applyChanges({ migrate: step === "migrate" });
	};

	const handleBack = () => {
		if (currentIndex > 0) setStep(stepKeys[currentIndex - 1]);
	};

	const handleOpenChange = (nextOpen: boolean) => {
		if (isLoading) return;
		setOpen(nextOpen);
		if (!nextOpen) resetState();
	};

	const primaryText = useMemo(() => {
		if (!isFinalStep) return "Next";
		if (migrateNeeded) return "Apply & migrate";
		if (isMetadataOnly) return "Save changes";
		if (versionChoice === "new") return "Create version";
		if (versionChoice === "all") return "Update all versions";
		return isLatest ? "Update version" : "Update this version";
	}, [isFinalStep, migrateNeeded, isMetadataOnly, versionChoice, isLatest]);

	const title = "Save plan changes";
	const description = useMemo(() => {
		switch (step) {
			case "review":
				return "Review what's changing before you save.";
			case "strategy":
				return "Choose how this applies across versions.";
			case "scope":
				return "Pick which variants to update alongside this plan.";
			default:
				return migrateNeeded
					? "Confirm and migrate existing customers."
					: "Confirm the changes you're about to save.";
		}
	}, [step, migrateNeeded]);
	const migrateSubtitle = useMemo(() => {
		if (isMetadataOnly) return "Applies across every version and variant.";
		if (migrateNeeded)
			return "Customers you don't migrate stay on their current version.";
		return "Existing customers stay on their current version.";
	}, [isMetadataOnly, migrateNeeded]);

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="max-w-lg max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
				<DialogHeader className="gap-3 p-4 pb-3">
					<div className="flex flex-col gap-1.5">
						<DialogTitle>{title}</DialogTitle>
						<DialogDescription>{description}</DialogDescription>
					</div>
					{steps.length > 1 && (
						<Stepper
							steps={steps}
							currentKey={step}
							onStepSelect={(key) => setStep(key as StepKey)}
						/>
					)}
				</DialogHeader>

				<motion.div
					initial={false}
					animate={{ height: bodyHeight ?? "auto" }}
					transition={LAYOUT_TRANSITION}
					style={{ overflow: "clip" }}
					className="min-h-0 shrink-0"
				>
					<div ref={bodyRef} className="px-4 pt-1 pb-4">
						<motion.div
							key={step}
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							transition={{ duration: 0.15, ease: "easeOut" }}
							className="text-sm flex flex-col gap-4"
						>
							{step === "review" && (
								<div className="flex flex-col gap-2.5">
									<FieldLabel>Preview changes</FieldLabel>
									<div className="rounded-lg bg-secondary/40 px-3 py-2.5 flex flex-col gap-2">
										{priceChange && (
											<PlanPriceHeader
												priceChange={priceChange}
												product={product}
												currency={currency}
											/>
										)}
										<ItemChangeList itemChanges={preview?.item_changes ?? []} />
										<PlanSettingsChanges changes={settingsChanges} />
									</div>
								</div>
							)}

							{step === "scope" && (
								<div className="flex flex-col gap-2.5">
									<div className="flex flex-col gap-0.5">
										<FieldLabel>Apply to variants</FieldLabel>
										<span className="text-tertiary-foreground text-xs">
											Select which variants receive this change. Unselected
											variants stay as they are.
										</span>
									</div>
									<PropagateVariantsStep
										variants={variantConflicts}
										selectedIds={selectedVariantIds}
										onToggle={(id) =>
											setSelectedVariantIds((prev) =>
												prev.includes(id)
													? prev.filter((v) => v !== id)
													: [...prev, id],
											)
										}
									/>
								</div>
							)}

							{step === "strategy" && (
								<div className="flex flex-col gap-2.5">
									<FieldLabel>How should this apply?</FieldLabel>
									<RadioGroup
										value={versionChoice}
										onValueChange={(val) =>
											setVersionChoice(val as VersionChoice)
										}
									>
										{isLatest && (
											<AreaRadioGroupItem
												value="new"
												label="Create new version"
												description="Existing customers stay grandfathered on their current versions."
											/>
										)}
										<AreaRadioGroupItem
											value="update"
											label={
												isLatest
													? "Update existing version"
													: "Update this version"
											}
											description={
												isLatest
													? hasVariants
														? "Updates the latest version of this plan and the variants you select next. You can migrate current customers after."
														: "Updates the latest version of this plan. You can migrate current customers after."
													: `Updates only v${product.version}. Other versions and variants stay as they are.`
											}
										/>
										{(!isLatest || hasHistoricalVersions) && (
											<AreaRadioGroupItem
												value="all"
												label="Update all versions"
												description="Applies this change to every version of this plan and its variants."
											/>
										)}
									</RadioGroup>
								</div>
							)}

							{step === "migrate" && (
								<>
									<div className="flex flex-col gap-2.5">
										<div className="flex flex-col gap-0.5">
											<FieldLabel>Review &amp; confirm</FieldLabel>
											<span className="text-tertiary-foreground text-xs">
												{migrateSubtitle}
											</span>
										</div>
										{isMetadataOnly ? (
											<div className="rounded-lg bg-secondary/40 px-3 py-2.5">
												<PlanSettingsChanges changes={settingsChanges} />
											</div>
										) : (
											<MigrateTargetsStep
												showCustomers={migrateNeeded}
												targets={migrateTargets}
											/>
										)}
									</div>

									{migrateNeeded && customCount > 0 && (
										<div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 px-3 py-2.5">
											<div className="flex flex-col gap-0.5">
												<span className="text-sm font-medium text-foreground">
													Apply to custom plans
												</span>
												<span className="text-xs text-muted-foreground">
													There {customCount === 1 ? "is" : "are"} {customCount}{" "}
													user{customCount !== 1 ? "s" : ""} on custom versions.
												</span>
											</div>
											<Switch
												checked={includeCustom}
												onCheckedChange={setIncludeCustom}
											/>
										</div>
									)}
								</>
							)}
						</motion.div>
					</div>
				</motion.div>

				{step === "migrate" && (
					<div className="px-4 pb-1">
						<ConfirmInput
							productId={product.id}
							value={confirmText}
							onChange={setConfirmText}
						/>
					</div>
				)}

				<DialogFooter className="flex-row items-center gap-2 p-4 pt-2">
					{step !== "review" && (
						<ShortcutButton
							variant="secondary"
							onClick={handleBack}
							disabled={isLoading}
						>
							Back
						</ShortcutButton>
					)}
					{step === "migrate" && migrateNeeded && (
						<ShortcutButton
							variant="secondary"
							onClick={() => applyChanges({ migrate: false })}
							disabled={isLoading || !confirmed}
						>
							Skip
						</ShortcutButton>
					)}
					<ShortcutButton
						variant="primary"
						metaShortcut="enter"
						onClick={advance}
						isLoading={isLoading}
						disabled={isLoading || (step === "migrate" && !confirmed)}
						className="flex-1 justify-center"
					>
						{primaryText}
					</ShortcutButton>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
