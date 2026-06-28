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
import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { PlanPriceHeader } from "@/components/forms/shared/plan-items/PlanPriceHeader";
import { ItemChangeList } from "@/components/v2/ItemChangeList";
import { useOrg } from "@/hooks/common/useOrg";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useMigrationsQuery } from "@/hooks/queries/useMigrationsQuery";
import { usePlanUpdatePreview } from "@/hooks/queries/usePlanUpdatePreview";
import { usePlanVariants } from "@/hooks/queries/usePlanVariants";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useProductStore } from "@/hooks/stores/useProductStore";
import { ProductService } from "@/services/products/ProductService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr, navigateTo } from "@/utils/genUtils";
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";
import {
	useProductQuery,
	useProductQueryState,
} from "../../product/hooks/useProductQuery";
import {
	buildAllVersionsUpdateMigrationDraft,
	buildCombinedVariantMigrationDraft,
	buildInPlaceUpdatePlanParams,
	buildPreviewUpdatePlanParams,
	type AllVersionsUpdateMigrationTarget,
	type CombinedVariantTarget,
	planHasPricingChange,
} from "./buildMigrationDraft";
import { PropagateVariantsStep } from "./PropagateVariantsStep";
import { getPlanPriceChange } from "./planMigrationDiff";
import { Stepper, type StepperStep } from "./Stepper";
import type { VariantConflictInfo } from "./variantConflicts";

type VersionChoice = "new" | "update" | "all";
type StepKey = "review" | "variants" | "migrate";

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

const previewHasCustomersAcrossVersions = ({
	preview,
}: {
	preview: Pick<PlanUpdatePreview, "has_customers" | "other_versions">;
}) =>
	preview.has_customers ||
	(preview.other_versions ?? []).some((version) => version.has_customers);

const collectAllVersionMigrationTargets = ({
	preview,
	selectedVariantIds,
}: {
	preview: PlanUpdatePreview | undefined;
	selectedVariantIds: string[];
}): AllVersionsUpdateMigrationTarget[] => {
	if (!preview) return [];

	const targets: AllVersionsUpdateMigrationTarget[] = [];
	if (preview.customize && previewHasCustomersAcrossVersions({ preview })) {
		targets.push({ id: preview.plan_id, customize: preview.customize });
	}

	for (const variantId of selectedVariantIds) {
		const variantPreview = preview.variants.find(
			(variant) => variant.plan_id === variantId,
		);
		if (
			variantPreview?.customize &&
			previewHasCustomersAcrossVersions({ preview: variantPreview })
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
	} = useProductQuery();
	const { setQueryStates } = useProductQueryState();
	const { invalidate: invalidateProducts } = useProductsQuery();
	const { createMigration, invalidate: invalidateMigrations } =
		useMigrationsQuery();
	const { org } = useOrg();

	const [step, setStep] = useState<StepKey>("review");
	const [versionChoice, setVersionChoice] = useState<VersionChoice>("new");
	const [includeCustom, setIncludeCustom] = useState(false);
	const [confirmText, setConfirmText] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [selectedVariantIds, setSelectedVariantIds] = useState<string[]>([]);
	const [appliedVariantTargets, setAppliedVariantTargets] = useState<
		CombinedVariantTarget[]
	>([]);
	const [appliedAllVersionTargets, setAppliedAllVersionTargets] = useState<
		AllVersionsUpdateMigrationTarget[]
	>([]);
	// Snapshotted at apply time: markSaved overwrites baseProduct, which zeroes
	// out the live preview these would otherwise derive from.
	const [appliedBaseTarget, setAppliedBaseTarget] =
		useState<CombinedVariantTarget | null>(null);
	const [baseChangedPricing, setBaseChangedPricing] = useState(false);

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

	const customCount = useMemo(
		() =>
			Object.values(versionCounts).reduce(
				(sum, vc) => sum + (vc.custom ?? 0),
				0,
			),
		[versionCounts],
	);

	// Patch-in-place applies the change to the base's current version, so its
	// existing customers need a migration. New-version intentionally grandfathers.
	const baseNeedsMigration =
		versionChoice === "update" && (preview?.versionable ?? false);
	const allVersionsMigrationTargets = useMemo(
		() =>
			versionChoice === "all"
				? collectAllVersionMigrationTargets({
						preview,
						selectedVariantIds,
					})
				: [],
		[versionChoice, preview, selectedVariantIds],
	);
	const allVersionConflictCount = useMemo(() => {
		if (!preview || versionChoice !== "all") return 0;

		const baseConflicts = (preview.other_versions ?? []).reduce(
			(sum, version) => sum + version.conflicts.length,
			0,
		);
		const variantConflicts = preview.variants
			.filter((variant) => selectedVariantIds.includes(variant.plan_id))
			.reduce(
				(sum, variant) =>
					sum +
					(variant.other_versions ?? []).reduce(
						(inner, version) => inner + version.conflicts.length,
						0,
					),
				0,
			);

		return baseConflicts + variantConflicts;
	}, [preview, selectedVariantIds, versionChoice]);

	const { data: variants = [], refetch: refetchVariants } = usePlanVariants(
		product.id,
		open,
	);

	const variantConflicts = useMemo<VariantConflictInfo[]>(
		() =>
			variants.map((variant) => {
				const previewVariant = preview?.variants.find(
					(v) => v.plan_id === variant.id,
				);
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

	const hasVariants = variants.length > 0;
	// New-version and all-versions catalog rewrites do not use the version-reset
	// migration path below; only the single-version in-place path does.
	const migrateNeeded =
		(versionChoice === "update" &&
			(baseNeedsMigration || selectedVariantIds.length > 0)) ||
		allVersionsMigrationTargets.length > 0;

	const steps: StepperStep[] = useMemo(
		() => [
			{ key: "review", label: "Review" },
			...(hasVariants ? [{ key: "variants", label: "Variants" }] : []),
			...(migrateNeeded || step === "migrate"
				? [{ key: "migrate", label: "Migrate" }]
				: []),
		],
		[hasVariants, migrateNeeded, step],
	);

	const resetState = () => {
		setStep("review");
		setVersionChoice("new");
		setIncludeCustom(false);
		setConfirmText("");
		setSelectedVariantIds([]);
		setAppliedVariantTargets([]);
		setAppliedAllVersionTargets([]);
		setAppliedBaseTarget(null);
		setBaseChangedPricing(false);
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

	// Apply the base edit (in-place or new version) + propagate to selected variants.
	const applyBaseChange = async () => {
		if (versionChoice === "update" || versionChoice === "all") {
			if (!baseProduct) return;
			if (product.id !== baseProduct.id) {
				throw new Error(
					"Plan IDs cannot be changed when updating the current version",
				);
			}
			const updateParams = buildInPlaceUpdatePlanParams({
				baseProduct,
				editedProduct: product,
				features,
			});
			if (versionChoice === "all") {
				delete updateParams.disable_version;
				updateParams.all_versions = true;
			}
			if (selectedVariantIds.length > 0) {
				updateParams.update_variant_ids = selectedVariantIds;
			}
			await ProductService.updatePlan(axiosInstance, updateParams);
		} else {
			const updateParams = buildInPlaceUpdatePlanParams({
				baseProduct: baseProduct ?? product,
				editedProduct: product,
				features,
			});
			delete updateParams.disable_version;
			if (selectedVariantIds.length > 0) {
				updateParams.update_variant_ids = selectedVariantIds;
			}
			await ProductService.updatePlan(axiosInstance, updateParams);
		}

		// Capture pricing-change and the base migration target before markSaved
		// overwrites baseProduct (which collapses the live preview these derive from).
		setBaseChangedPricing(
			baseProduct
				? planHasPricingChange({ baseProduct, product, features })
				: false,
		);
		setAppliedBaseTarget(
			baseNeedsMigration ? { id: product.id, version: product.version } : null,
		);
		setAppliedAllVersionTargets(
			versionChoice === "all" ? allVersionsMigrationTargets : [],
		);
		markSaved();

		// Variants were just versioned; read their new versions for migration.
		if (selectedVariantIds.length > 0) {
			const fresh = (await refetchVariants()).data ?? [];
			const targets: CombinedVariantTarget[] = selectedVariantIds
				.map((id) => {
					const v = fresh.find((x) => x.id === id);
					return v ? { id, version: v.latest_version } : null;
				})
				.filter((t): t is CombinedVariantTarget => t !== null);
			setAppliedVariantTargets(targets);
		}
	};

	const goNextFromConfig = async () => {
		if (!confirmed) {
			toast.error("Confirmation text is incorrect");
			return;
		}
		setIsLoading(true);
		try {
			await applyBaseChange();
			toast.success(
				versionChoice === "new"
					? "New version created"
					: versionChoice === "all"
						? "All versions updated"
						: "Plan updated",
			);
			void invalidateProduct();
			void invalidateProducts();

			if (migrateNeeded) {
				setStep("migrate");
			} else {
				closeDialog();
				if (versionChoice === "new") void syncToLatestVersion();
				else void refetch();
			}
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to save plan"));
		} finally {
			setIsLoading(false);
		}
	};

	// One migration can cover the base plus selected variants.
	// Version-reset targets use each plan's post-save catalog version.
	const combinedMigrationDraft = () => {
		if (appliedAllVersionTargets.length > 0) {
			return buildAllVersionsUpdateMigrationDraft({
				targets: appliedAllVersionTargets,
				hasPricingChange: baseChangedPricing,
				includeCustom,
			});
		}

		const targets: CombinedVariantTarget[] = [
			...(appliedBaseTarget ? [appliedBaseTarget] : []),
			...appliedVariantTargets,
		];
		return buildCombinedVariantMigrationDraft({
			variants: targets,
			hasPricingChange: baseChangedPricing,
			includeCustom,
		});
	};

	const handleMigrateAction = async () => {
		setIsLoading(true);
		try {
			const draft = combinedMigrationDraft();
			closeDialog();
			void syncToLatestVersion();

			if (draft) {
				const migration = await createMigration({
					id: draft.id,
					filter: draft.filter,
					operations: draft.operations,
					no_billing_changes: draft.no_billing_changes,
				});
				await invalidateMigrations();
				toast.success("Migration created");
				navigateTo(`/migrations/${migration.id}?step=live&run=true`, navigate);
			}
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to create migration"));
		} finally {
			setIsLoading(false);
		}
	};

	const skipMigration = () => {
		closeDialog();
		void syncToLatestVersion();
	};

	const handlePrimary = () => {
		if (step === "review") {
			if (hasVariants) {
				setStep("variants");
				return;
			}
			if (!confirmed) {
				toast.error("Confirmation text is incorrect");
				return;
			}
			void goNextFromConfig();
			return;
		}
		if (step === "variants") {
			if (!confirmed) {
				toast.error("Confirmation text is incorrect");
				return;
			}
			void goNextFromConfig();
			return;
		}
		void handleMigrateAction();
	};

	const handleBack = () => {
		if (step === "variants") setStep("review");
	};

	const handleOpenChange = (nextOpen: boolean) => {
		if (isLoading) return;
		setOpen(nextOpen);
		if (!nextOpen) resetState();
	};

	const propagationLabel =
		selectedVariantIds.length > 0
			? ` & propagate to ${selectedVariantIds.length}`
			: "";

	const migrateTargetLabel = useMemo(() => {
		if (appliedAllVersionTargets.length > 0) {
			const count = appliedAllVersionTargets.length;
			return `${count} plan${count !== 1 ? "s" : ""} across all versions`;
		}

		const parts: string[] = [];
		if (appliedBaseTarget) parts.push("the base plan");
		if (appliedVariantTargets.length > 0) {
			parts.push(
				`${appliedVariantTargets.length} variant${appliedVariantTargets.length !== 1 ? "s" : ""}`,
			);
		}
		const joined =
			parts.length === 2
				? `${parts[0]} and ${parts[1]}`
				: (parts[0] ?? "this plan");
		return `Existing customers on ${joined}`;
	}, [appliedAllVersionTargets, appliedBaseTarget, appliedVariantTargets]);

	const migrationDescription =
		appliedAllVersionTargets.length > 0
			? `Existing customers on ${migrateTargetLabel} will receive the updated plan changes. Customers you don't migrate stay as they are.`
			: `${migrateTargetLabel} will be moved to the updated version. Customers you don't migrate stay on their current version.`;

	const primaryText = useMemo(() => {
		if (step === "review") return hasVariants ? "Next" : "Apply changes";
		if (step === "variants") {
			if (versionChoice === "new") return `Create version${propagationLabel}`;
			if (versionChoice === "all") {
				return `Update all versions${propagationLabel}`;
			}
			return `Update plan${propagationLabel}`;
		}
		return "Create migration";
	}, [step, hasVariants, versionChoice, propagationLabel]);

	const title =
		step === "migrate" ? "Migrate existing customers" : "Save plan changes";
	// Confirmation lives on the variants step when variants exist, otherwise on review.
	const onConfirmStep = step === (hasVariants ? "variants" : "review");

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="max-w-lg max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
				<DialogHeader className="gap-3.5 p-5 pb-4 border-b border-border/60">
					<DialogTitle className="text-[15px]">{title}</DialogTitle>
					{steps.length > 1 && <Stepper steps={steps} currentKey={step} />}
				</DialogHeader>

				<div className="overflow-y-auto min-h-0 flex-1 px-5 py-5">
					<DialogDescription asChild>
						<motion.div
							key={step}
							initial={{ opacity: 0, y: 4 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
							className="text-sm flex flex-col gap-6"
						>
							{step === "review" && (
								<>
									<div className="flex flex-col gap-3">
										<div className="rounded-xl bg-secondary/40 px-3.5 py-3 flex flex-col gap-2">
											<PlanPriceHeader
												priceChange={priceChange}
												product={product}
												currency={currency}
											/>
											<ItemChangeList
												itemChanges={preview?.item_changes ?? []}
											/>
										</div>
									</div>

									<div className="flex flex-col gap-2.5">
										<FieldLabel>How should this apply?</FieldLabel>
										<RadioGroup
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
												description="Update the current plan version now. You can migrate current users next."
											/>
											{hasHistoricalVersions && (
												<AreaRadioGroupItem
													value="all"
													label="Update all versions"
													description="Apply this change to every version of this plan and selected variants."
												/>
											)}
										</RadioGroup>
										{versionChoice === "all" && allVersionConflictCount > 0 && (
											<InfoBox variant="warning">
												This update conflicts with {allVersionConflictCount}{" "}
												historical version
												{allVersionConflictCount === 1 ? "" : "s"}. Review
												affected versions before applying.
											</InfoBox>
										)}
									</div>

									{!hasVariants && (
										<ConfirmInput
											productId={product.id}
											value={confirmText}
											onChange={setConfirmText}
										/>
									)}
								</>
							)}

							{step === "variants" && (
								<>
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
									<ConfirmInput
										productId={product.id}
										value={confirmText}
										onChange={setConfirmText}
									/>
								</>
							)}

							{step === "migrate" && (
								<div className="flex flex-col gap-4">
									<p className="text-sm text-muted-foreground">
										{migrationDescription}
									</p>

									{customCount > 0 && (
										<div className="flex items-center justify-between gap-4">
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
								</div>
							)}
						</motion.div>
					</DialogDescription>
				</div>

				<DialogFooter className="flex-row justify-between gap-2 sm:justify-between p-5 pt-4 border-t border-border/60">
					{step === "variants" ? (
						<ShortcutButton
							variant="secondary"
							onClick={handleBack}
							disabled={isLoading}
						>
							Back
						</ShortcutButton>
					) : (
						<span />
					)}

					<div className="flex items-center gap-2">
						{step === "migrate" && (
							<ShortcutButton
								variant="secondary"
								onClick={skipMigration}
								disabled={isLoading}
							>
								Skip
							</ShortcutButton>
						)}
						<ShortcutButton
							variant="primary"
							metaShortcut="enter"
							onClick={handlePrimary}
							isLoading={isLoading}
							disabled={isLoading || (onConfirmStep && !confirmed)}
						>
							{primaryText}
						</ShortcutButton>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
