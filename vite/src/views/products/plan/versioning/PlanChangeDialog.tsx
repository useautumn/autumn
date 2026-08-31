import type {
	CatalogPlanUpdatePreview,
	FrontendProduct,
	UpdateCatalogPlanParamsInput,
	UpdateCatalogResponse,
} from "@autumn/shared";
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
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { PlanPriceHeader } from "@/components/forms/shared/plan-items/PlanPriceHeader";
import { ItemChangeList } from "@/components/v2/ItemChangeList";
import { LAYOUT_TRANSITION } from "@/components/v2/sheets/SharedSheetComponents";
import { useOrg } from "@/hooks/common/useOrg";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useLicenseProductsQuery } from "@/hooks/queries/useLicenseProductsQuery";
import { useMigrationsQuery } from "@/hooks/queries/useMigrationsQuery";
import { usePlanVariants } from "@/hooks/queries/usePlanVariants";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useProductStore } from "@/hooks/stores/useProductStore";
import { useMeasuredHeight } from "@/hooks/useMeasuredHeight";
import { CatalogV2Service } from "@/services/CatalogV2Service";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr, navigateTo } from "@/utils/genUtils";
import {
	useProductQuery,
	useProductQueryState,
} from "../../product/hooks/useProductQuery";
import { useOptionalProductContext } from "../../product/ProductContext";
import {
	type CatalogVersionChoice,
	catalogPreviewAliasReplacements,
	catalogPreviewPlanIdChange,
	catalogPreviewVersionSlugChange,
	isConfirmOnlyPlanChangeDialog,
} from "../catalog/catalogPlanPreview";
import { usePlanChangeCatalogPreview } from "../catalog/usePlanChangeCatalogPreview";
import {
	commitLicenseChanges,
	getLicenseUpdatePayload,
} from "../components/plan-licenses/useLicenseSaveRegistry";
import { defaultVersionSlug } from "../components/versionLabel";
import { useVariantLinkVisibility } from "../hooks/useVariantLinkVisibility";
import { mintVersionSlugError } from "../utils/versionSlug";
import { LicenseChangeList } from "./LicenseChangeList";
import { LicenseParentTargetsStep } from "./LicenseParentTargetsStep";
import { MigrateTargetsStep } from "./MigrateTargetsStep";
import { MintVersionSlugInput } from "./MintVersionSlugInput";
import {
	emptyMintSlugSelection,
	type MintSlugSelection,
	mintTargetSlugConflicts,
	withMintSlugOverride,
} from "./mintTargetSlugs";
import { PlanChangeFieldLabel } from "./PlanChangeFieldLabel";
import { PlanIdChangeNotice } from "./PlanIdChangeNotice";
import {
	PlanSettingsChanges,
	previousAttributesToSettingChanges,
} from "./PlanSettingsChanges";
import { PromoteReviewSection } from "./PromoteReviewSection";
import { getPlanPriceChange } from "./planMigrationDiff";
import { Stepper, type StepperStep } from "./Stepper";
import { savedVersionPin } from "./savedVersionPin";
import { VariantTargetsStep } from "./VariantTargetsStep";
import { VersionSlugChangeNotice } from "./VersionSlugChangeNotice";

type StepKey =
	| "review"
	| "variant_scope"
	| "license_scope"
	| "strategy"
	| "migrate";

const buildPlanChangeSteps = ({
	showVersionStrategy,
	showVariantScope,
	showLicenseParentScope,
}: {
	showVersionStrategy: boolean;
	showVariantScope: boolean;
	showLicenseParentScope: boolean;
}): StepperStep[] => [
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
];

/** A slug problem blocks the step that shows it, so Next never hides its own cause. */
const stepBlocksPlanChangeAdvance = ({
	step,
	confirmed,
	baseSlugInvalid,
	hasSlugConflicts,
}: {
	step: StepKey;
	confirmed: boolean;
	baseSlugInvalid: boolean;
	hasSlugConflicts: boolean;
}): boolean => {
	if (step === "strategy") return baseSlugInvalid;
	if (step === "variant_scope") return hasSlugConflicts;
	if (step === "migrate") {
		return !confirmed || baseSlugInvalid || hasSlugConflicts;
	}
	return false;
};

const planChangePrimaryText = ({
	isFinalStep,
	migrateNeeded,
	isMetadataOnly,
	showVersionStrategy,
	effectiveVersionChoice,
	versionChoiceOnlyAffectsParents,
	isLatest,
}: {
	isFinalStep: boolean;
	migrateNeeded: boolean;
	isMetadataOnly: boolean;
	showVersionStrategy: boolean;
	effectiveVersionChoice: CatalogVersionChoice;
	versionChoiceOnlyAffectsParents: boolean;
	isLatest: boolean;
}) => {
	if (!isFinalStep) return "Next";
	if (migrateNeeded) return "Apply & migrate";
	if (isMetadataOnly || !showVersionStrategy) return "Save changes";
	if (effectiveVersionChoice === "new") {
		if (versionChoiceOnlyAffectsParents) return "Create parent versions";
		return "Create version";
	}
	if (effectiveVersionChoice === "all") return "Update all versions";
	if (isLatest) return "Update version";
	return "Update this version";
};

const planChangeDescription = ({
	aliasOnly,
	planIdChangeOnly,
	versionSlugChangeOnly,
	promotionOnly,
	step,
	migrateNeeded,
}: {
	aliasOnly: boolean;
	planIdChangeOnly: boolean;
	versionSlugChangeOnly: boolean;
	promotionOnly: boolean;
	step: StepKey;
	migrateNeeded: boolean;
}) => {
	if (planIdChangeOnly) {
		return "Confirm you want to change this plan's ID.";
	}
	if (versionSlugChangeOnly) {
		return "Confirm you want to rename this version's slug.";
	}
	if (aliasOnly) {
		return "This plan ID is currently an alias of another plan.";
	}
	if (promotionOnly) {
		return "Confirm which version this plan resolves to by default.";
	}
	if (step === "review") return "Review what's changing before you save.";
	if (step === "strategy") return "Choose how this applies across versions.";
	if (step === "variant_scope") {
		return "Pick which variants to update alongside this plan.";
	}
	if (step === "license_scope") {
		return "Pick which parent plans receive this license update.";
	}
	if (migrateNeeded) return "Confirm and migrate existing customers.";
	return "Confirm the changes you're about to save.";
};

const planChangeMigrateSubtitle = ({
	isMetadataOnly,
	migrateNeeded,
}: {
	isMetadataOnly: boolean;
	migrateNeeded: boolean;
}) => {
	if (isMetadataOnly) return "Applies across every version and variant.";
	if (migrateNeeded) {
		return "Customers you don't migrate stay on their current version.";
	}
	return "Existing customers stay on their current version.";
};

const planChangeSaveSuccessText = ({
	choice,
}: {
	choice: CatalogVersionChoice;
}) => {
	if (choice === "new") return "New version created";
	if (choice === "all") return "All versions updated";
	return "Plan updated";
};

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

export type PlanChangeCreateConfirm = {
	preview: CatalogPlanUpdatePreview;
	plans: UpdateCatalogPlanParamsInput[];
	onSaved?: (result: UpdateCatalogResponse) => void | Promise<void>;
	title?: string;
	successText?: string;
	errorText?: string;
	confirmLabel?: string;
};

export default function PlanChangeDialog({
	createConfirm,
	open,
	setOpen,
}: {
	createConfirm?: PlanChangeCreateConfirm;
	open: boolean;
	setOpen: (open: boolean) => void;
}) {
	const axiosInstance = useAxiosInstance();
	const navigate = useNavigate();
	const product = useProductStore((s) => s.product);
	const baseProduct = useProductStore((s) => s.baseProduct);
	const setBaseProduct = useProductStore((s) => s.setBaseProduct);
	const { basePlanId: persistedBasePlanId } = useVariantLinkVisibility(product);
	const { features = [] } = useFeaturesQuery();
	const catalogLicenses = useOptionalProductContext()?.catalogLicenses ?? [];
	const {
		refetch,
		invalidate: invalidateProduct,
		versionCounts,
		numVersions,
	} = useProductQuery();
	const { setQueryStates } = useProductQueryState();
	const { products, invalidate: invalidateProducts } = useProductsQuery();
	const { invalidate: invalidateLicenseProducts } = useLicenseProductsQuery();
	const { invalidate: invalidateMigrations } = useMigrationsQuery();
	const { org } = useOrg();

	const [step, setStep] = useState<StepKey>("review");
	const [versionChoice, setVersionChoice] =
		useState<CatalogVersionChoice>("new");
	const [includeCustom, setIncludeCustom] = useState(false);
	const [confirmText, setConfirmText] = useState("");
	const [slugSelection, setSlugSelection] = useState<MintSlugSelection>(
		emptyMintSlugSelection,
	);
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
	const isLatest = product.version >= numVersions;
	const priceChange = getPlanPriceChange({ baseProduct, product, currency });
	const editorOpen = open && !createConfirm;
	const licenses = editorOpen
		? getLicenseUpdatePayload({
				persistedLinks: catalogLicenses.map(({ planLicense }) => planLicense),
			})
		: undefined;

	const { data: variants = [] } = usePlanVariants(product.id, editorOpen);
	const namesByPlanId = {
		...Object.fromEntries(products.map((entry) => [entry.id, entry.name])),
		...Object.fromEntries(
			variants.map((variant) => [variant.id, variant.name]),
		),
	};

	const {
		preview,
		isMetadataOnly,
		showNewOption,
		showAllOption,
		showUpdateOption,
		effectiveVersionChoice,
		strategy,
		variantTargets,
		selectedVariantKeys,
		showVersionStrategy,
		showVariantScope,
		effectiveVariantKeys,
		licenseParentTargets,
		selectedLicenseParentKeys,
		showLicenseParentScope,
		versionChoiceOnlyAffectsParents,
		settingsChanges,
		migrateNeeded,
		migrateTargets,
		buildSaveParams,
	} = usePlanChangeCatalogPreview({
		open: editorOpen,
		baseProduct,
		product,
		features,
		licenses,
		versionChoice,
		variantSelection,
		licenseParentSelection,
		includeCustom,
		isLatest,
		namesByPlanId,
		persistedBasePlanId,
	});

	const customCount = Object.values(versionCounts).reduce(
		(sum, vc) => sum + (vc.custom ?? 0),
		0,
	);

	const planPreview = createConfirm?.preview ?? preview;
	const aliasReplacements = catalogPreviewAliasReplacements({
		preview: planPreview,
	});
	const planIdChange = createConfirm
		? undefined
		: catalogPreviewPlanIdChange({
				preview: planPreview,
				nextPlanId: product.id,
			});
	// On a mint the typed slug names the new row, so only an in-place save renames.
	const versionSlugRename =
		createConfirm || strategy === "new_version"
			? undefined
			: catalogPreviewVersionSlugChange({ preview: planPreview });
	const mintsNewVersion = strategy === "new_version";
	const mintedVersionDefaultSlug = defaultVersionSlug({
		version: preview?.versioning?.new_version ?? product.version + 1,
	});
	const baseSlugInvalid =
		mintsNewVersion && !!mintVersionSlugError({ slug: slugSelection.base });
	const slugConflicts = mintsNewVersion
		? mintTargetSlugConflicts({
				targets: variantTargets,
				selectedKeys: effectiveVariantKeys,
				selection: slugSelection,
			})
		: [];
	const mintSlugsBlocked = baseSlugInvalid || slugConflicts.length > 0;
	const stepBlocksAdvance = createConfirm
		? false
		: stepBlocksPlanChangeAdvance({
				step,
				confirmed,
				baseSlugInvalid,
				hasSlugConflicts: slugConflicts.length > 0,
			});
	const confirmOnlyDialog =
		!!createConfirm ||
		isConfirmOnlyPlanChangeDialog({
			preview: planPreview,
			showVersionStrategy,
			showVariantScope,
			showLicenseParentScope,
		});
	const steps = confirmOnlyDialog
		? [{ key: "review", label: "Review", icon: SealCheckIcon }]
		: buildPlanChangeSteps({
				showVersionStrategy,
				showVariantScope,
				showLicenseParentScope,
			});
	const stepKeys = steps.map((s) => s.key as StepKey);
	const currentIndex = stepKeys.indexOf(step);
	const isFinalStep = currentIndex === stepKeys.length - 1;

	const resetState = () => {
		setStep("review");
		setVersionChoice(isLatest ? "new" : "update");
		setIncludeCustom(false);
		setConfirmText("");
		setSlugSelection(emptyMintSlugSelection());
		setVariantSelection(null);
		setLicenseParentSelection(null);
	};

	const syncToSavedVersion = async (version: number | null) => {
		await setQueryStates({ version });
		await refetch();
		await Promise.all([invalidateProduct(), invalidateProducts()]);
	};

	const markSaved = () => setBaseProduct(product as FrontendProduct);

	const closeDialog = () => {
		setOpen(false);
		resetState();
	};

	const applyChanges = async ({ migrate }: { migrate: boolean }) => {
		if (!createConfirm && step === "migrate" && !confirmed) {
			toast.error("Confirmation text is incorrect");
			return;
		}
		setIsLoading(true);
		try {
			if (createConfirm) {
				const result = await CatalogV2Service.update(axiosInstance, {
					plans: createConfirm.plans,
				});
				toast.success(createConfirm.successText ?? "Plan created");
				closeDialog();
				await createConfirm.onSaved?.(result);
				return;
			}

			const willMigrate =
				migrateNeeded && migrate && strategy !== "new_version";
			const result = await CatalogV2Service.update(axiosInstance, {
				plans: buildSaveParams({ migrate, slugSelection }),
			});
			if (licenses) {
				commitLicenseChanges();
				void invalidateLicenseProducts();
			}
			markSaved();
			toast.success(
				planChangeSaveSuccessText({ choice: effectiveVersionChoice }),
			);
			void invalidateProduct();
			void invalidateProducts();
			closeDialog();
			const renamed = Boolean(baseProduct && product.id !== baseProduct.id);
			const versionPin = savedVersionPin({
				plans: result.plans,
				planId: product.id,
			});
			if (renamed) {
				const versionQuery =
					versionPin === null ? "" : `?version=${versionPin}`;
				navigateTo(`/products/${product.id}${versionQuery}`, navigate);
			} else if (effectiveVersionChoice === "new") {
				void syncToSavedVersion(versionPin);
			} else {
				void refetch();
			}

			if (willMigrate) {
				void invalidateMigrations();
				const migrationId = result.migrations?.[0]?.id;
				navigateTo(
					migrationId
						? `/migrations/${migrationId}?step=live&run=true`
						: "/migrations",
					navigate,
				);
			}
		} catch (error) {
			toast.error(
				getBackendErr(
					error,
					createConfirm
						? (createConfirm.errorText ?? "Failed to create plan")
						: "Failed to save plan",
				),
			);
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

	const primaryText =
		createConfirm?.confirmLabel && isFinalStep
			? createConfirm.confirmLabel
			: planChangePrimaryText({
					isFinalStep,
					migrateNeeded,
					isMetadataOnly,
					showVersionStrategy,
					effectiveVersionChoice,
					versionChoiceOnlyAffectsParents,
					isLatest,
				});

	const title =
		createConfirm?.title ??
		(createConfirm ? "Create plan" : "Save plan changes");
	const hasPromotion = Boolean(planPreview?.promotion_details);
	const hasAliasReplacements = aliasReplacements.length > 0;
	const isPromotionOnlyConfirm =
		confirmOnlyDialog &&
		hasPromotion &&
		!planIdChange &&
		!versionSlugRename &&
		!hasAliasReplacements;
	const confirmOnlySettings = previousAttributesToSettingChanges(
		planPreview?.plan_change?.previous_attributes,
	);
	const description = planChangeDescription({
		aliasOnly: confirmOnlyDialog && hasAliasReplacements,
		planIdChangeOnly: confirmOnlyDialog && !!planIdChange,
		versionSlugChangeOnly:
			confirmOnlyDialog && !!versionSlugRename && !planIdChange,
		promotionOnly: isPromotionOnlyConfirm,
		step,
		migrateNeeded,
	});
	const migrateSubtitle = planChangeMigrateSubtitle({
		isMetadataOnly,
		migrateNeeded,
	});

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
								{step === "review" && confirmOnlyDialog && (
									<>
										<PlanIdChangeNotice
											from={planIdChange?.from}
											to={planIdChange?.to}
											namesByPlanId={namesByPlanId}
											replacements={aliasReplacements}
										/>
										<VersionSlugChangeNotice
											from={versionSlugRename?.from}
											to={versionSlugRename?.to}
										/>
										<PromoteReviewSection preview={planPreview} />
										{confirmOnlySettings.length > 0 && (
											<div className="rounded-lg bg-secondary/40 px-3 py-2.5">
												<PlanSettingsChanges changes={confirmOnlySettings} />
											</div>
										)}
									</>
								)}

								{step === "review" && !confirmOnlyDialog && (
									<div className="flex flex-col gap-2.5">
										<PromoteReviewSection preview={planPreview} />
										<PlanChangeFieldLabel>Preview changes</PlanChangeFieldLabel>
										<div className="rounded-lg bg-secondary/40 px-3 py-2.5 flex flex-col gap-2">
											{priceChange && (
												<PlanPriceHeader
													priceChange={priceChange}
													product={product}
													currency={currency}
												/>
											)}
											<ItemChangeList
												itemChanges={preview?.plan_change?.item_changes ?? []}
											/>
											<PlanSettingsChanges changes={settingsChanges} />
											<LicenseChangeList
												changes={preview?.plan_change?.license_changes ?? []}
												features={features}
											/>
										</div>
										{settingsChanges.some((c) => c.key === "name") && (
											<div className="rounded-lg bg-secondary/40 px-3 py-2.5 text-xs text-muted-foreground">
												This update will rename Stripe products.
											</div>
										)}
									</div>
								)}

								{step === "variant_scope" && (
									<div className="flex flex-col gap-2.5">
										<div className="flex flex-col gap-0.5">
											<PlanChangeFieldLabel>
												Apply to variants
											</PlanChangeFieldLabel>
											<span className="text-tertiary-foreground text-xs">
												Pick which variants receive this update, and which
												versions. Unselected versions stay as they are.
											</span>
											{slugConflicts.length > 0 && (
												<span className="text-amber-600 text-xs dark:text-amber-500">
													Rename the highlighted version slugs to continue.
												</span>
											)}
										</div>
										<VariantTargetsStep
											baseMintsNewVersion={mintsNewVersion}
											features={features}
											onChange={(next) => setVariantSelection(next)}
											onSlugChange={({ planId, slug }) =>
												setSlugSelection((current) =>
													withMintSlugOverride({
														selection: current,
														planId,
														slug,
													}),
												)
											}
											selectedKeys={selectedVariantKeys}
											slugSelection={slugSelection}
											targets={variantTargets}
										/>
									</div>
								)}

								{step === "license_scope" && (
									<div className="flex flex-col gap-2.5">
										<div className="flex flex-col gap-0.5">
											<PlanChangeFieldLabel>
												Apply to parent plans
											</PlanChangeFieldLabel>
											<span className="text-tertiary-foreground text-xs">
												Pick which parents receive this update, and how far
												back. Unselected versions keep their current effective
												license configuration.
											</span>
										</div>
										<LicenseParentTargetsStep
											features={features}
											targets={licenseParentTargets}
											selectedKeys={selectedLicenseParentKeys}
											onChange={(next) => setLicenseParentSelection(next)}
										/>
									</div>
								)}

								{step === "strategy" && (
									<div className="flex flex-col gap-2.5">
										<PlanChangeFieldLabel>
											How should this apply?
										</PlanChangeFieldLabel>
										<RadioGroup
											value={effectiveVersionChoice}
											onValueChange={(val) =>
												setVersionChoice(val as CatalogVersionChoice)
											}
										>
											{showNewOption && (
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
											{showUpdateOption && (
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
																? variantTargets.length > 0
																	? "Updates this version. Next you pick which linked variant versions follow. You can migrate current customers after."
																	: "Updates the latest version of this plan. You can migrate current customers after."
																: variantTargets.length > 0
																	? `Updates only v${product.version}. Next you pick which variant versions linked to it follow.`
																	: `Updates only v${product.version}. Other versions stay as they are.`
													}
												/>
											)}
											{showAllOption && (
												<AreaRadioGroupItem
													value="all"
													label="Update all versions"
													description="Applies this change to every version of this plan. Next you pick which variant versions follow — each gets the diff of the version it is linked to."
												/>
											)}
										</RadioGroup>
										{mintsNewVersion && (
											<MintVersionSlugInput
												defaultSlug={mintedVersionDefaultSlug}
												onChange={(base) =>
													setSlugSelection((current) => ({ ...current, base }))
												}
												value={slugSelection.base}
											/>
										)}
									</div>
								)}

								{step === "migrate" && (
									<>
										<PlanIdChangeNotice
											from={planIdChange?.from}
											to={planIdChange?.to}
											namesByPlanId={namesByPlanId}
											replacements={aliasReplacements}
										/>
										<VersionSlugChangeNotice
											from={versionSlugRename?.from}
											to={versionSlugRename?.to}
										/>
										<PromoteReviewSection preview={planPreview} />
										<div className="flex flex-col gap-2.5">
											<div className="flex flex-col gap-0.5">
												<PlanChangeFieldLabel>
													Review &amp; confirm
												</PlanChangeFieldLabel>
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
															features={features}
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
					<div className="flex flex-col gap-3 px-4 pt-3 pb-2">
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
							disabled={isLoading || !confirmed || mintSlugsBlocked}
						>
							Skip
						</ShortcutButton>
					)}
					<ShortcutButton
						variant="primary"
						metaShortcut="enter"
						onClick={advance}
						isLoading={isLoading}
						disabled={isLoading || stepBlocksAdvance}
						className="flex-1 justify-center"
					>
						{primaryText}
					</ShortcutButton>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
