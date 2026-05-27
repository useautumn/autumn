import type { FrontendProduct } from "@autumn/shared";
import { isPriceItem, productsAreSame } from "@autumn/shared";
import { CheckCircleIcon } from "@phosphor-icons/react";
import { LucideLoaderCircle } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { PlanItemsSection } from "@/components/forms/shared";
import { getProductPriceDisplay } from "@/components/forms/update-subscription-v2/components/PriceDisplay";
import { Button } from "@/components/v2/buttons/Button";
import { cn } from "@/lib/utils";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/v2/dialogs/Dialog";
import { Input } from "@/components/v2/inputs/Input";
import { useOrg } from "@/hooks/common/useOrg";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useMigrationsQuery } from "@/hooks/queries/useMigrationsQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useProductStore } from "@/hooks/stores/useProductStore";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr, navigateTo } from "@/utils/genUtils";
import { useProductQuery } from "../../product/hooks/useProductQuery";
import { updateProduct } from "../../product/utils/updateProduct";
import { buildMigrationDraft, type MigrationDraft } from "./buildMigrationDraft";

function usePriceChange(
	baseProduct: FrontendProduct | null,
	product: FrontendProduct,
	currency: string,
) {
	return useMemo(() => {
		if (!baseProduct) return null;

		const oldDisplay = getProductPriceDisplay({ product: baseProduct, currency });
		const newDisplay = getProductPriceDisplay({ product, currency });

		const oldPrice = oldDisplay.type === "price" ? oldDisplay.formattedPrice : "Free";
		const newPrice = newDisplay.type === "price" ? newDisplay.formattedPrice : "Free";
		const oldInterval = oldDisplay.type === "price" ? oldDisplay.intervalText : null;
		const newInterval = newDisplay.type === "price" ? newDisplay.intervalText : null;

		if (oldPrice === newPrice && oldInterval === newInterval) return null;

		const originalPriceItem = baseProduct.items?.find((i) => isPriceItem(i));
		const currentPriceItem = product.items?.find((i) => isPriceItem(i));

		return {
			oldPrice,
			newPrice,
			oldIntervalText: oldInterval !== newInterval ? oldInterval : null,
			newIntervalText: newInterval,
			isUpgrade: (currentPriceItem?.price ?? 0) > (originalPriceItem?.price ?? 0),
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
	const { features = [] } = useFeaturesQuery();
	const { refetch } = useProductQuery();
	const { invalidate: invalidateProducts } = useProductsQuery();
	const { createMigration, invalidate: invalidateMigrations } = useMigrationsQuery();
	const { org } = useOrg();

	const [confirmText, setConfirmText] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [loadingAction, setLoadingAction] = useState<
		"new-version" | "update" | "migrate" | null
	>(null);
	const [step, setStep] = useState<"confirm" | "plan-updated">("confirm");
	const migrationDraftRef = useRef<MigrationDraft | null>(null);

	const currency = org?.default_currency ?? "USD";
	const priceChange = usePriceChange(baseProduct, product, currency);

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

	const handleNewVersion = async () => {
		if (!confirmed) {
			toast.error("Confirmation text is incorrect");
			return;
		}

		setIsLoading(true);
		setLoadingAction("new-version");
		await updateProduct({
			axiosInstance,
			productId: product.id,
			product,
			version: baseProduct?.version,
			onSuccess: async () => {
				await refetch();
				invalidateProducts();
			},
		});
		toast.success("New version created");
		setIsLoading(false);
		setLoadingAction(null);
		setOpen(false);
		setConfirmText("");
	};

	const handleUpdatePlan = async () => {
		if (!confirmed) {
			toast.error("Confirmation text is incorrect");
			return;
		}
		if (!baseProduct) return;

		setIsLoading(true);
		setLoadingAction("update");

		try {
			migrationDraftRef.current = buildMigrationDraft({
				baseProduct,
				editedProduct: product,
				features,
			});

			const result = await updateProduct({
				axiosInstance,
				productId: product.id,
				product,
				version: baseProduct.version,
				disableVersion: true,
				onSuccess: async () => {
					await refetch();
					invalidateProducts();
				},
			});

			if (!result) {
				migrationDraftRef.current = null;
				return;
			}

			setStep("plan-updated");
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to update plan"));
			migrationDraftRef.current = null;
		} finally {
			setIsLoading(false);
			setLoadingAction(null);
		}
	};

	const handleCreateMigration = async () => {
		const draft = migrationDraftRef.current;
		if (!draft) return;

		setIsLoading(true);
		setLoadingAction("migrate");

		try {
			const migration = await createMigration({
				id: draft.id,
				filter: draft.filter,
				operations: draft.operations,
				no_billing_changes: draft.no_billing_changes,
			});

			await invalidateMigrations();

			setOpen(false);
			setConfirmText("");
			setStep("confirm");
			migrationDraftRef.current = null;
			toast.success("Migration created from plan changes");
			navigateTo(`/migrations/${migration.id}?step=operations`, navigate);
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to create migration"));
		} finally {
			setIsLoading(false);
			setLoadingAction(null);
		}
	};

	const handleOpenChange = (nextOpen: boolean) => {
		if (!isLoading) {
			setOpen(nextOpen);
			if (!nextOpen) {
				setConfirmText("");
				setStep("confirm");
				migrationDraftRef.current = null;
			}
		}
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="max-w-md">
				{step === "confirm" ? (
					<>
						<DialogHeader>
							<DialogTitle>Save plan changes</DialogTitle>
							<DialogDescription asChild>
								<div className="text-sm flex flex-col gap-6">
									<p>
										This plan has existing customers. Choose how to
										apply your changes.
									</p>

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

									<div className="flex flex-col gap-2">
										<p>
											Type{" "}
											<code className="font-bold">{product.id}</code>{" "}
											to continue.
										</p>

										<Input
											value={confirmText}
											onChange={(e) =>
												setConfirmText(e.target.value)
											}
											type="text"
											placeholder={product.id}
											className="w-full"
										/>
									</div>
								</div>
							</DialogDescription>
						</DialogHeader>

						<DialogFooter className="flex flex-col gap-3 sm:flex-col">
							<ActionCard
								title="Update existing plan"
								description="Update the plan and create a migration to move existing customers to the new configuration."
								onClick={handleUpdatePlan}
								isLoading={loadingAction === "update"}
								disabled={isLoading || !confirmed}
							/>
							<ActionCard
								title="Create new version"
								description="Publish a new version for future customers. Existing customers stay on their current plan."
								onClick={handleNewVersion}
								isLoading={loadingAction === "new-version"}
								disabled={isLoading || !confirmed}
							/>
						</DialogFooter>
					</>
				) : (
					<>
						<DialogHeader>
							<div className="flex items-center gap-2">
								<CheckCircleIcon
									size={20}
									weight="fill"
									className="text-green-500"
								/>
								<DialogTitle>Plan updated</DialogTitle>
							</div>
							<DialogDescription>
								Create a migration to move existing customers to
								the new plan configuration.
							</DialogDescription>
						</DialogHeader>

						<DialogFooter>
							<Button
								variant="primary"
								onClick={handleCreateMigration}
								isLoading={loadingAction === "migrate"}
								disabled={isLoading}
								className="w-full"
							>
								Create migration
							</Button>
						</DialogFooter>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}

function ActionCard({
	title,
	description,
	onClick,
	isLoading,
	disabled,
}: {
	title: string;
	description: string;
	onClick: () => void;
	isLoading: boolean;
	disabled: boolean;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className={cn(
				"w-full text-left rounded-lg border p-3 transition-colors cursor-pointer",
				"hover:border-primary/50 hover:bg-interactive-secondary",
				"disabled:opacity-50 disabled:pointer-events-none",
			)}
		>
			<div className="flex items-center justify-between">
				<span className="text-sm font-medium text-foreground">{title}</span>
				{isLoading && (
					<LucideLoaderCircle className="animate-spin size-4 text-muted-foreground" />
				)}
			</div>
			<p className="text-xs text-tertiary-foreground mt-0.5">{description}</p>
		</button>
	);
}
