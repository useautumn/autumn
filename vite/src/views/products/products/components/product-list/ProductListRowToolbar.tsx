import { AppEnv, type ProductV2 } from "@autumn/shared";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
	ToolbarButton,
} from "@autumn/ui";
import {
	ArchiveIcon,
	ArrowCounterClockwiseIcon,
	CopyIcon,
	GitForkIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import {
	type SandboxSummary,
	useCopySandbox,
} from "@/hooks/queries/useSandboxesQuery";
import { useActiveSandbox } from "@/hooks/sandbox/useActiveSandbox";
import { ProductService } from "@/services/products/ProductService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import { getBackendErr, pushPage } from "@/utils/genUtils";
import { CreateVariantDialog } from "@/views/products/plan/components/CreateVariantDialog";
import { CopyProductDialog } from "../CopyProductDialog";

export const ProductListRowToolbar = ({
	product,
	onDeleteClick,
	sandboxes,
}: {
	product: ProductV2;
	onDeleteClick?: (product: ProductV2) => void;
	sandboxes: SandboxSummary[];
}) => {
	const [dropdownOpen, setDropdownOpen] = useState(false);
	const [copyOpen, setCopyOpen] = useState(false);
	const [copyToEnv, setCopyToEnv] = useState<AppEnv>(AppEnv.Sandbox);
	const [createVariantOpen, setCreateVariantOpen] = useState(false);
	const [isCreatingVariant, setIsCreatingVariant] = useState(false);
	const [variantId, setVariantId] = useState("");
	const [variantName, setVariantName] = useState("");
	const { counts, invalidate: invalidateProducts } = useProductsQuery();
	const navigate = useNavigate();
	const axiosInstance = useAxiosInstance();
	const activeSandbox = useActiveSandbox();
	const env = useEnv();
	// Only a Sandbox-env view with an active sandbox is a real named-sandbox
	// context; activeSandbox can be stale on a production route (no header sent).
	const inNamedSandbox = env === AppEnv.Sandbox && !!activeSandbox;
	const copySandbox = useCopySandbox();

	const currentSandboxId = inNamedSandbox ? activeSandbox?.id : undefined;
	const otherSandboxes = sandboxes.filter((s) => s.id !== currentSandboxId);

	const handleCopyToSandbox = async (target: SandboxSummary) => {
		setDropdownOpen(false);
		try {
			await copySandbox.mutateAsync({
				...(inNamedSandbox && activeSandbox
					? { fromSandboxId: activeSandbox.id }
					: { fromMaster: true }),
				toSandboxId: target.id,
				productIds: [product.id],
			});
			toast.success(`Copied ${product.name} to ${target.name}`);
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to copy plan"));
		}
	};

	const isVariant = !!product.base_internal_product_id;

	const productCounts = counts[product.id];
	const allCount = productCounts?.all || 0;
	let deleteText = allCount > 0 ? "Archive" : "Delete";
	let DeleteIcon = allCount > 0 ? ArchiveIcon : TrashIcon;

	if (product.archived) {
		deleteText = "Unarchive";
		DeleteIcon = ArrowCounterClockwiseIcon;
	}

	const handleCreateVariant = async () => {
		if (!variantId.trim() || !variantName.trim()) {
			toast.error("Variant ID and name are required");
			return;
		}
		setIsCreatingVariant(true);
		try {
			await ProductService.createVariant(axiosInstance, {
				base_plan_id: product.id,
				variant_plan_id: variantId.trim(),
				name: variantName.trim(),
			});
			toast.success("Variant created");
			setCreateVariantOpen(false);
			setVariantId("");
			setVariantName("");
			await invalidateProducts();
			pushPage({
				navigate,
				path: `/products/${variantId.trim()}`,
				preserveParams: true,
			});
		} catch (error) {
			const message = (error as { response?: { data?: { message?: string } } })
				?.response?.data?.message;
			toast.error(message ?? "Failed to create variant");
		} finally {
			setIsCreatingVariant(false);
		}
	};

	return (
		<>
			<CopyProductDialog
				open={copyOpen}
				setOpen={setCopyOpen}
				product={product}
				targetEnv={copyToEnv}
			/>
			{createVariantOpen && (
				<CreateVariantDialog
					open={createVariantOpen}
					setOpen={setCreateVariantOpen}
					product={product}
					variantId={variantId}
					setVariantId={setVariantId}
					variantName={variantName}
					setVariantName={setVariantName}
					isLoading={isCreatingVariant}
					onCreate={handleCreateVariant}
				/>
			)}

			<DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
				<div
					onClick={(e) => {
						e.preventDefault();
						e.stopPropagation();
					}}
					onMouseDown={(e) => {
						e.preventDefault();
						e.stopPropagation();
					}}
				>
					<DropdownMenuTrigger asChild>
						<ToolbarButton />
					</DropdownMenuTrigger>
				</div>
				<DropdownMenuContent align="end">
					{!isVariant && (
						<DropdownMenuSub>
							<DropdownMenuSubTrigger className="flex gap-2">
								<CopyIcon />
								Copy to
							</DropdownMenuSubTrigger>
							<DropdownMenuSubContent>
								<DropdownMenuItem
									className="flex gap-2"
									onClick={(e) => {
										e.stopPropagation();
										e.preventDefault();
										setDropdownOpen(false);
										setCopyToEnv(AppEnv.Sandbox);
										setCopyOpen(true);
									}}
								>
									Sandbox
								</DropdownMenuItem>
								<DropdownMenuItem
									className="flex gap-2"
									onClick={(e) => {
										e.stopPropagation();
										e.preventDefault();
										setDropdownOpen(false);
										setCopyToEnv(AppEnv.Live);
										setCopyOpen(true);
									}}
								>
									Production
								</DropdownMenuItem>
								{otherSandboxes.length > 0 && <DropdownMenuSeparator />}
								{otherSandboxes.map((s) => (
									<DropdownMenuItem
										key={s.id}
										className="flex gap-2"
										onClick={(e) => {
											e.stopPropagation();
											e.preventDefault();
											handleCopyToSandbox(s);
										}}
									>
										{s.name}
									</DropdownMenuItem>
								))}
							</DropdownMenuSubContent>
						</DropdownMenuSub>
					)}
					{!isVariant && !product.archived && (
						<DropdownMenuItem
							className="flex gap-2"
							onClick={(e) => {
								e.stopPropagation();
								e.preventDefault();
								setDropdownOpen(false);
								setCreateVariantOpen(true);
							}}
						>
							<GitForkIcon />
							Create variant
						</DropdownMenuItem>
					)}
					<DropdownMenuItem
						className="flex gap-2"
						onClick={(e) => {
							e.stopPropagation();
							e.preventDefault();
							setDropdownOpen(false);
							onDeleteClick?.(product);
						}}
					>
						<DeleteIcon />
						{deleteText}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</>
	);
};
