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
	TicketIcon,
} from "@phosphor-icons/react";
import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { PlanPriceHeader } from "@/components/forms/shared/plan-items/PlanPriceHeader";
import { ItemChangeList } from "@/components/v2/ItemChangeList";
import { LAYOUT_TRANSITION } from "@/components/v2/sheets/SharedSheetComponents";
import { useOrg } from "@/hooks/common/useOrg";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useLicenseProductsQuery } from "@/hooks/queries/useLicenseProductsQuery";
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
import { useProductContext } from "../../product/ProductContext";
import {
	commitLicenseChanges,
	getLicenseUpdatePayload,
	useHasLicenseChanges,
} from "../components/plan-licenses/useLicenseSaveRegistry";
import {
	buildSelectedLicenseParentUpdates,
	buildMigrateTargets,
	getLicenseParentTargetId,
} from "./buildMigrateTargets";
import {
	buildInPlaceUpdatePlanParams,
	buildPreviewUpdatePlanParams,
	buildVersionUpdatePlanParams,
} from "./buildMigrationDraft";
import { getDefaultPropagationTargetIds } from "./getDefaultPropagationTargetIds";
import { LicenseChangeList } from "./LicenseChangeList";
import { MigrateTargetsStep } from "./MigrateTargetsStep";
import {
	PlanSettingsChanges,
	previousAttributesToSettingChanges,
} from "./PlanSettingsChanges";
import {
	type PropagationTarget,
	PropagationTargetsStep,
} from "./PropagationTargetsStep";
import { getPlanPriceChange } from "./planMigrationDiff";
import { previewHasVersionableTargets } from "./previewHasAffectedCustomers";
import { Stepper, type StepperStep } from "./Stepper";
import type { VariantConflictInfo } from "./variantConflicts";

type VersionChoice = "new" | "update" | "all";
type StepKey =
	| "review"
	| "variant_scope"
	| "license_scope"
	| "strategy"
	| "migrate";

const EMPTY_SELECTION: string[] = [];

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

// A version needs a migration only when it has customers to move AND a
// migratable diff (item/price changes; free-trial edits version without one).
const entryNeedsMigration = (
	entry: Pick<
		PlanUpdatePreview,
		"item_changes" | "price_change" | "has_customers"
	>,
) =>
	entry.has_customers &&
	((entry.item_changes?.length ?? 0) > 0 || entry.price_change !== undefined);

const hasMigrationTargets = ({
	preview,
	selectedVariantIds,
	versionChoice,
}: {
	preview: PlanUpdatePreview | undefined;
	selectedVariantIds: string[];
	versionChoice: VersionChoice;
}): boolean => {
	// New-version grandfathers everyone; update/all patch live versions.
	if (!preview || versionChoice === "new") return false;
	const includeHistorical = versionChoice === "all";

	const baseEntries = [
		preview,
		...(includeHistorical ? (preview.other_versions ?? []) : []),
	];
	if (baseEntries.some(entryNeedsMigration)) return true;

	return selectedVariantIds.some((variantId) => {
		const entries = preview.variants
			.filter((variant) => variant.plan_id === variantId)
			.sort((a, b) => b.version - a.version);
		const candidates = includeHistorical ? entries : entries.slice(0, 1);
		return candidates.some(entryNeedsMigration);
	});
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
	const { catalogLicenses } = useProductContext();
	const {
		refetch,
		invalidate: invalidateProduct,
		versionCounts,
		numVersions,
	} = useProductQuery();
	const { setQueryStates } = useProductQueryState();
	const { invalidate: invalidateProducts } = useProductsQuery();
	const { invalidate: invalidateLicenseProducts } = useLicenseProductsQuery();
	const planLicenses = catalogLicenses.map(({ planLicense }) => planLicense);
	const licenseHasChanges = useHasLicenseChanges();
	const { invalidate: invalidateMigrations } = useMigrationsQuery();
	const { org } = useOrg();

	const [step, setStep] = useState<StepKey>("review");
	const [versionChoice, setVersionChoice] = useState<VersionChoice>("new");
	const [includeCustom, setIncludeCustom] = useState(false);
	const [confirmText, setConfirmText] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [variantSelection, setVariantSelection] = useState<string[] | null>(
		null,
	);
	const [licenseParentSelection, setLicenseParentSelection] = useState<
		string[] | null
	>(null);
	const { ref: bodyRef, height: bodyHeight } =
		useMeasuredHeight<HTMLDivElement>();

	const confirmed = confirmText === product.id;
	const currency = org?.default_currency ?? "USD";

	const priceChange = useMemo(
		() => getPlanPriceChange({ baseProduct, product, currency }),
		[baseProduct, product, currency],
	);
	const licenseUpdates = useMemo(
		() =>
			open
				? getLicenseUpdatePayload({ persistedLinks: planLicenses })
				: undefined,
		[open, licenseHasChanges, planLicenses],
	);

	// Preview the in-place update so versioning, customer impact, item changes
	// and variant conflicts come from the backend. A malformed draft (e.g. a
	// half-entered price) must degrade to "no preview", never throw during render.
	const previewParams = useMemo(() => {
		try {
			return buildPreviewUpdatePlanParams({
				baseProduct,
				editedProduct: product,
				features,
				licenses: licenseUpdates,
			});
		} catch {
			return null;
		}
	}, [baseProduct, product, features, licenseUpdates]);

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
	const hasPlanVersionableChange = !!preview?.customize;
	const hasLicenseChanges = (preview?.license_changes.length ?? 0) > 0;
	const isVersionableChange = hasPlanVersionableChange || hasLicenseChanges;
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
	const showVersionStrategy =
		!isMetadataOnly && !!preview && previewHasVersionableTargets(preview);
	const effectiveVersionChoice = showVersionStrategy ? versionChoice : "update";
	// Only main-plan changes propagate to variants; license-link edits stay on
	// the selected parent version.
	const showVariantScope =
		hasPlanVersionableChange &&
		hasVariants &&
		(isLatest || effectiveVersionChoice === "all");

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
	const variantTargets = useMemo<PropagationTarget[]>(
		() =>
			variantConflicts.map(({ variant, conflicts, itemChanges }) => ({
				id: variant.id,
				name: variant.name,
				detail: variant.id,
				conflicts,
				itemChanges,
			})),
		[variantConflicts],
	);
	const defaultVariantIds = useMemo(
		() => getDefaultPropagationTargetIds({ targets: variantTargets }),
		[variantTargets],
	);
	const selectedVariantIds = variantSelection ?? defaultVariantIds;
	const effectiveVariantIds = showVariantScope
		? selectedVariantIds
		: EMPTY_SELECTION;

	const licenseParentTargets = useMemo<PropagationTarget[]>(
		() =>
			(preview?.license_parents ?? []).map((parent) => ({
				id: getLicenseParentTargetId(parent),
				name: parent.name,
				detail: `${parent.plan_id} · v${parent.version}`,
				conflicts: parent.conflicts,
				itemChanges:
					parent.license_changes[0]?.plan_changes?.item_changes ?? [],
			})),
		[preview],
	);
	const defaultLicenseParentIds = useMemo(
		() => getDefaultPropagationTargetIds({ targets: licenseParentTargets }),
		[licenseParentTargets],
	);
	const selectedLicenseParentIds =
		licenseParentSelection ?? defaultLicenseParentIds;
	const showLicenseParentScope = licenseParentTargets.length > 0;
	const versionChoiceOnlyAffectsParents =
		!preview?.versionable &&
		(preview?.license_parents ?? []).some((parent) => parent.versionable);
	const effectiveLicenseParentIds = showLicenseParentScope
		? selectedLicenseParentIds
		: EMPTY_SELECTION;

	const migrateNeeded = useMemo(
		() =>
			hasMigrationTargets({
				preview,
				selectedVariantIds: effectiveVariantIds,
				versionChoice: effectiveVersionChoice,
			}),
		[preview, effectiveVariantIds, effectiveVersionChoice],
	);

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

	const migrateTargets = useMemo(() => {
		if (!preview) return [];
		return buildMigrateTargets({
			preview,
			selectedVariantIds: effectiveVariantIds,
			selectedLicenseParentIds: effectiveLicenseParentIds,
			versionChoice: effectiveVersionChoice,
			currentVersion: product.version,
			baseName: product.name ?? product.id,
		});
	}, [
		preview,
		effectiveVariantIds,
		effectiveLicenseParentIds,
		effectiveVersionChoice,
		product,
	]);

	const steps: StepperStep[] = useMemo(
		() => [
			{ key: "review", label: "Changes", icon: SlidersIcon },
			...(!showVersionStrategy
				? []
				: [{ key: "strategy", label: "Versions", icon: StackIcon }]),
			...(showVariantScope
				? [{ key: "variant_scope", label: "Variants", icon: GitForkIcon }]
				: []),
			...(showLicenseParentScope
				? [{ key: "license_scope", label: "Parents", icon: TicketIcon }]
				: []),
			{ key: "migrate", label: "Review", icon: SealCheckIcon },
		],
		[showVariantScope, showLicenseParentScope, showVersionStrategy],
	);
	const stepKeys = steps.map((s) => s.key as StepKey);
	const currentIndex = stepKeys.indexOf(step);
	const isFinalStep = currentIndex === stepKeys.length - 1;

	const resetState = () => {
		setStep("review");
		setVersionChoice(isLatest ? "new" : "update");
		setIncludeCustom(false);
		setConfirmText("");
		setVariantSelection(null);
		setLicenseParentSelection(null);
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
			if (
				effectiveVersionChoice === "update" ||
				effectiveVersionChoice === "all"
			) {
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
					licenses: licenseUpdates,
				});
				if (effectiveVersionChoice === "all") {
					delete updateParams.disable_version;
					updateParams.all_versions = true;
				}
			} else {
				updateParams = buildVersionUpdatePlanParams({
					baseProduct: baseProduct ?? product,
					editedProduct: product,
					features,
					licenses: licenseUpdates,
				});
			}
			if (effectiveVariantIds.length > 0) {
				updateParams.update_variant_ids = effectiveVariantIds;
			}
			if ((preview?.license_parents.length ?? 0) > 0) {
				updateParams.update_license_parents = buildSelectedLicenseParentUpdates(
					{
						parents: preview?.license_parents ?? [],
						selectedIds: effectiveLicenseParentIds,
					},
				);
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
			if (licenseUpdates) {
				commitLicenseChanges();
				void invalidateLicenseProducts();
			}
			markSaved();
			toast.success(
				effectiveVersionChoice === "new"
					? "New version created"
					: effectiveVersionChoice === "all"
						? "All versions updated"
						: "Plan updated",
			);
			void invalidateProduct();
			void invalidateProducts();
			closeDialog();
			if (effectiveVersionChoice === "new") void syncToLatestVersion();
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
		if (!showVersionStrategy) return "Save changes";
		if (effectiveVersionChoice === "new") {
			return versionChoiceOnlyAffectsParents
				? "Create parent versions"
				: "Create version";
		}
		if (effectiveVersionChoice === "all") return "Update all versions";
		return isLatest ? "Update version" : "Update this version";
	}, [
		isFinalStep,
		migrateNeeded,
		isMetadataOnly,
		effectiveVersionChoice,
		versionChoiceOnlyAffectsParents,
		isLatest,
		showVersionStrategy,
	]);

	const title = "Save plan changes";
	const description = useMemo(() => {
		switch (step) {
			case "review":
				return "Review what's changing before you save.";
			case "strategy":
				return "Choose how this applies across versions.";
			case "variant_scope":
				return "Pick which variants to update alongside this plan.";
			case "license_scope":
				return "Pick which parent plans receive this license update.";
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

				<div className="min-h-0 flex-1 overflow-y-auto">
					<motion.div
						initial={false}
						animate={{ height: bodyHeight ?? "auto" }}
						transition={LAYOUT_TRANSITION}
						style={{ overflow: "clip" }}
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
											<ItemChangeList
												itemChanges={preview?.item_changes ?? []}
											/>
											<PlanSettingsChanges changes={settingsChanges} />
											<LicenseChangeList
												changes={preview?.license_changes ?? []}
												features={features}
											/>
										</div>
									</div>
								)}

								{step === "variant_scope" && (
									<div className="flex flex-col gap-2.5">
										<div className="flex flex-col gap-0.5">
											<FieldLabel>Apply to variants</FieldLabel>
											<span className="text-tertiary-foreground text-xs">
												Select which variants receive this change. Unselected
												variants stay as they are.
											</span>
										</div>
										<PropagationTargetsStep
											targets={variantTargets}
											selectedIds={selectedVariantIds}
											onToggle={(id) =>
												setVariantSelection((current) => {
													const selected = current ?? defaultVariantIds;
													return selected.includes(id)
														? selected.filter((value) => value !== id)
														: [...selected, id];
												})
											}
										/>
									</div>
								)}

								{step === "license_scope" && (
									<div className="flex flex-col gap-2.5">
										<div className="flex flex-col gap-0.5">
											<FieldLabel>Apply to parent plans</FieldLabel>
											<span className="text-tertiary-foreground text-xs">
												Selected parents receive this child-plan update.
												Unselected parents keep their current effective license
												configuration.
											</span>
										</div>
										<PropagationTargetsStep
											targets={licenseParentTargets}
											selectedIds={selectedLicenseParentIds}
											onToggle={(id) =>
												setLicenseParentSelection((current) => {
													const selected = current ?? defaultLicenseParentIds;
													return selected.includes(id)
														? selected.filter((value) => value !== id)
														: [...selected, id];
												})
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
													label={
														versionChoiceOnlyAffectsParents
															? "Create new parent versions"
															: "Create new version"
													}
													description={
														versionChoiceOnlyAffectsParents
															? "Selected parent plans with customers get new versions. Existing customers stay grandfathered."
															: "Existing customers stay grandfathered on their current versions."
													}
												/>
											)}
											<AreaRadioGroupItem
												value="update"
												label={
													versionChoiceOnlyAffectsParents
														? "Update parent versions in place"
														: isLatest
															? "Update existing version"
															: "Update this version"
												}
												description={
													versionChoiceOnlyAffectsParents
														? "Updates selected parents in place while current customers retain their license definitions."
														: isLatest
															? hasVariants
																? "Updates the latest version of this plan and the variants you select next. You can migrate current customers after."
																: "Updates the latest version of this plan. You can migrate current customers after."
															: `Updates only v${product.version}. Other versions and variants stay as they are.`
												}
											/>
											{!hasLicenseChanges &&
												licenseParentTargets.length === 0 &&
												(!isLatest || hasHistoricalVersions) && (
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
												<div className="rounded-lg bg-secondary/40 px-3 py-2.5 flex flex-col gap-2">
													{priceChange && (
														<PlanPriceHeader
															priceChange={priceChange}
															product={product}
															currency={currency}
														/>
													)}
													<PlanSettingsChanges changes={settingsChanges} />
												</div>
											) : (
												<div className="flex flex-col gap-3">
													{settingsChanges.length > 0 && (
														<div className="flex flex-col gap-1.5">
															<div className="flex items-center gap-1.5 text-xs">
																<SlidersIcon
																	size={14}
																	className="text-muted-foreground"
																/>
																<span className="font-medium text-foreground">
																	Plan settings
																</span>
																<span className="text-tertiary-foreground">
																	· applies to all versions &amp; variants
																</span>
															</div>
															<div className="rounded-lg bg-secondary/40 px-3 py-2.5">
																<PlanSettingsChanges
																	changes={settingsChanges}
																/>
															</div>
														</div>
													)}
													<div className="flex flex-col gap-1.5">
														{settingsChanges.length > 0 && (
															<div className="flex items-center gap-1.5 text-xs">
																<StackIcon
																	size={14}
																	className="text-muted-foreground"
																/>
																<span className="font-medium text-foreground">
																	Items
																</span>
																<span className="text-tertiary-foreground">
																	· applies only to the versions below
																</span>
															</div>
														)}
														<MigrateTargetsStep
															showCustomers={migrateNeeded}
															showSettings={false}
															targets={migrateTargets}
														/>
													</div>
												</div>
											)}
										</div>

										{migrateNeeded && customCount > 0 && (
											<div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 px-3 py-2.5">
												<div className="flex flex-col gap-0.5">
													<span className="text-sm font-medium text-foreground">
														Apply to custom plans
													</span>
													<span className="text-xs text-muted-foreground">
														There {customCount === 1 ? "is" : "are"}{" "}
														{customCount} user{customCount !== 1 ? "s" : ""} on
														custom versions.
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
				</div>

				{step === "migrate" && (
					<div className="px-4 pt-3 pb-2">
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
