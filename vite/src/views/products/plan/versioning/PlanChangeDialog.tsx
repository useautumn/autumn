import {
	MinusCircleIcon,
	PencilSimpleIcon,
	PlusCircleIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/v2/buttons/Button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/v2/dialogs/Dialog";
import { Input } from "@/components/v2/inputs/Input";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useMigrationsQuery } from "@/hooks/queries/useMigrationsQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useProductStore } from "@/hooks/stores/useProductStore";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr, navigateTo } from "@/utils/genUtils";
import { useProductQuery } from "../../product/hooks/useProductQuery";
import { updateProduct } from "../../product/utils/updateProduct";
import {
	buildDiffSummary,
	buildMigrationDraft,
	type DiffSummaryEntry,
} from "./buildMigrationDraft";

const ACTION_ICONS = {
	added: PlusCircleIcon,
	removed: MinusCircleIcon,
	changed: PencilSimpleIcon,
} as const;

const ACTION_COLORS = {
	added: "text-emerald-500",
	removed: "text-red-500",
	changed: "text-amber-500",
} as const;

function DiffEntry({ entry }: { entry: DiffSummaryEntry }) {
	const Icon = ACTION_ICONS[entry.action];
	const color = ACTION_COLORS[entry.action];

	return (
		<div className="flex items-center gap-2 text-sm">
			<Icon size={16} weight="fill" className={color} />
			<span className="capitalize text-tertiary-foreground text-xs w-16">
				{entry.action}
			</span>
			<span className="text-foreground">{entry.label}</span>
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
	const { features = [] } = useFeaturesQuery();
	const { refetch } = useProductQuery();
	const { invalidate: invalidateProducts } = useProductsQuery();
	const { createMigration } = useMigrationsQuery();

	const [confirmText, setConfirmText] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [loadingAction, setLoadingAction] = useState<
		"new-version" | "update" | null
	>(null);

	const diffSummary =
		baseProduct && features.length > 0
			? buildDiffSummary({
					baseProduct,
					editedProduct: product,
					features,
				})
			: [];

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

	const handleUpdateAndMigrate = async () => {
		if (!confirmed) {
			toast.error("Confirmation text is incorrect");
			return;
		}
		if (!baseProduct) return;

		setIsLoading(true);
		setLoadingAction("update");

		try {
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
				setIsLoading(false);
				setLoadingAction(null);
				return;
			}

			const draft = buildMigrationDraft({
				baseProduct,
				editedProduct: product,
				features,
			});

			const migration = await createMigration({
				id: draft.id,
				filter: draft.filter,
				operations: draft.operations,
				no_billing_changes: draft.no_billing_changes,
			});

			setOpen(false);
			setConfirmText("");
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
			if (!nextOpen) setConfirmText("");
		}
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Save plan changes</DialogTitle>
					<DialogDescription asChild>
						<div className="text-sm flex flex-col gap-4">
							<p>
								This plan has existing customers. Choose how to
								apply your changes.
							</p>

							{diffSummary.length > 0 && (
								<div className="flex flex-col gap-1.5 rounded-lg border p-3">
									<span className="text-xs font-medium text-tertiary-foreground mb-1">
										Changes
									</span>
									{diffSummary.map((entry, i) => (
										<DiffEntry key={i} entry={entry} />
									))}
								</div>
							)}

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
					</DialogDescription>
				</DialogHeader>

				<DialogFooter className="flex flex-col gap-2 sm:flex-col">
					<Button
						variant="primary"
						onClick={handleUpdateAndMigrate}
						isLoading={loadingAction === "update"}
						disabled={isLoading || !confirmed}
						className="w-full"
					>
						Update plan & existing customers
					</Button>
					<Button
						variant="secondary"
						onClick={handleNewVersion}
						isLoading={loadingAction === "new-version"}
						disabled={isLoading || !confirmed}
						className="w-full"
					>
						Create new version
					</Button>
					<p className="text-xs text-tertiary-foreground text-center">
						New version only applies to new customers
					</p>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
