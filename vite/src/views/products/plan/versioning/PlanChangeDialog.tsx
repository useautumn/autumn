import type { FrontendProduct } from "@autumn/shared";
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
import { useProductContext } from "../../product/ProductContext";
import type { CatalogVersionChoice } from "../catalog/catalogPlanPreview";
import { usePlanChangeCatalogPreview } from "../catalog/usePlanChangeCatalogPreview";
import {
	commitLicenseChanges,
	getLicenseUpdatePayload,
} from "../components/plan-licenses/useLicenseSaveRegistry";
import { LicenseChangeList } from "./LicenseChangeList";
import { MigrateTargetsStep } from "./MigrateTargetsStep";
import { PlanSettingsChanges } from "./PlanSettingsChanges";
import { PropagationTargetsStep } from "./PropagationTargetsStep";
import { getPlanPriceChange } from "./planMigrationDiff";
import { Stepper, type StepperStep } from "./Stepper";

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
	step,
	migrateNeeded,
}: {
	step: StepKey;
	migrateNeeded: boolean;
}) => {
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
	const { invalidate: invalidateMigrations } = useMigrationsQuery();
	const { org } = useOrg();

	const [step, setStep] = useState<StepKey>("review");
	const [versionChoice, setVersionChoice] =
		useState<CatalogVersionChoice>("new");
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
	const isLatest = product.version >= numVersions;
	const priceChange = getPlanPriceChange({ baseProduct, product, currency });
	const licenses = open
		? getLicenseUpdatePayload({
				persistedLinks: catalogLicenses.map(({ planLicense }) => planLicense),
			})
		: undefined;

	const { data: variants = [] } = usePlanVariants(product.id, open);
	const namesByPlanId = Object.fromEntries(
		variants.map((variant) => [variant.id, variant.name]),
	);

	const {
		preview,
		isMetadataOnly,
		showNewOption,
		showAllOption,
		showUpdateOption,
		effectiveVersionChoice,
		strategy,
		variantTargets,
		defaultVariantIds,
		selectedVariantIds,
		showVersionStrategy,
		showVariantScope,
		licenseParentTargets,
		defaultLicenseParentIds,
		selectedLicenseParentIds,
		showLicenseParentScope,
		versionChoiceOnlyAffectsParents,
		settingsChanges,
		migrateNeeded,
		migrateTargets,
		buildSaveParams,
	} = usePlanChangeCatalogPreview({
		open,
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
	});

	const customCount = Object.values(versionCounts).reduce(
		(sum, vc) => sum + (vc.custom ?? 0),
		0,
	);

	const steps = buildPlanChangeSteps({
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

	const applyChanges = async ({ migrate }: { migrate: boolean }) => {
		if (step === "migrate" && !confirmed) {
			toast.error("Confirmation text is incorrect");
			return;
		}
		setIsLoading(true);
		try {
			const willMigrate = migrateNeeded && migrate && strategy !== "new_version";
			const result = await CatalogV2Service.update(axiosInstance, {
				plans: [buildSaveParams({ migrate })],
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
			if (effectiveVersionChoice === "new") void syncToLatestVersion();
			else void refetch();

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

	const primaryText = planChangePrimaryText({
		isFinalStep,
		migrateNeeded,
		isMetadataOnly,
		showVersionStrategy,
		effectiveVersionChoice,
		versionChoiceOnlyAffectsParents,
		isLatest,
	});

	const title = "Save plan changes";
	const description = planChangeDescription({ step, migrateNeeded });
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
																	? "Updates the latest version of this plan and the variants you select next. You can migrate current customers after."
																	: "Updates the latest version of this plan. You can migrate current customers after."
																: `Updates only v${product.version}. Other versions and variants stay as they are.`
													}
												/>
											)}
											{showAllOption && (
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
