import { AppEnv, type ProductV2 } from "@autumn/shared";
import type { AxiosError } from "axios";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/v2/buttons/Button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/v2/dialogs/Dialog";
import { FormLabel } from "@/components/v2/form/FormLabel";
import { Input } from "@/components/v2/inputs/Input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/v2/selects/Select";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { ProductService } from "@/services/products/ProductService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import { getBackendErr, navigateTo } from "@/utils/genUtils";

export const CopyProductDialog = ({
	open,
	setOpen,
	product,
	targetEnv,
	onSuccess,
}: {
	open: boolean;
	setOpen: (open: boolean) => void;
	product: ProductV2;
	targetEnv?: AppEnv;
	onSuccess?: (copiedProduct: ProductV2) => Promise<void>;
}) => {
	const env = useEnv();
	const axiosInstance = useAxiosInstance({ env });
	const { refetch } = useProductsQuery();
	const navigate = useNavigate();

	const [loading, setLoading] = useState(false);
	const [name, setName] = useState(product.name);
	const [id, setId] = useState(product.id);
	const [toEnv, setToEnv] = useState<AppEnv>(
		env === AppEnv.Live ? AppEnv.Sandbox : AppEnv.Live,
	);

	// Use targetEnv directly when provided, otherwise use state
	const effectiveEnv = targetEnv ?? toEnv;
	const envLabel = effectiveEnv === AppEnv.Sandbox ? "Sandbox" : "Production";

	const handleCopy = async () => {
		// 1. If env is the same and id is same, throw error
		if (env === effectiveEnv && id === product.id) {
			toast.error("Plan ID already exists");
			return;
		}

		setLoading(true);
		try {
			await ProductService.copyProduct(axiosInstance, product.id, {
				id: id,
				name: name,
				env: effectiveEnv,
			});
			await refetch();

			toast.success(`Successfully copied plan to ${envLabel}`);
			setOpen(false);

			// Construct the copied product with the new ID
			const copiedProduct: ProductV2 = {
				...product,
				id: id,
				name: name,
			};

			if (onSuccess) {
				await onSuccess(copiedProduct);
			} else if (env === effectiveEnv) {
				// Only navigate if copying to the same environment
				navigateTo(`/products/${id}`, navigate);
			}
		} catch (error: unknown) {
			console.log("Error copying product", error);
			toast.error(getBackendErr(error as AxiosError, "Failed to copy plan"));
		} finally {
			setLoading(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent
				className="bg-background"
				onClick={(e) => e.stopPropagation()}
			>
				<DialogHeader>
					<DialogTitle>
						{targetEnv ? `Copy to ${envLabel}` : "Copy Product"}
					</DialogTitle>
				</DialogHeader>
				<div className="flex flex-col gap-4">
					<div className="flex gap-2 w-full">
						<div className="w-full">
							<FormLabel>Name</FormLabel>
							<Input
								value={name}
								onChange={(e) => setName(e.target.value)}
								className="w-full"
							/>
						</div>
						<div className="w-full">
							<FormLabel>ID</FormLabel>
							<Input
								value={id}
								onChange={(e) => setId(e.target.value)}
								className="w-full"
							/>
						</div>
					</div>
					{!targetEnv && (
						<div>
							<FormLabel>Copy to environment</FormLabel>
							<Select
								value={toEnv}
								onValueChange={(value) => setToEnv(value as AppEnv)}
							>
								<SelectTrigger className="w-5/12">
									<SelectValue placeholder="Select environment" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={AppEnv.Live}>Production</SelectItem>
									<SelectItem value={AppEnv.Sandbox}>Sandbox</SelectItem>
								</SelectContent>
							</Select>
						</div>
					)}
				</div>
				<DialogFooter>
					<Button variant="secondary" onClick={() => setOpen(false)}>
						Cancel
					</Button>
					<Button variant="primary" onClick={handleCopy} isLoading={loading}>
						{targetEnv ? `Copy to ${envLabel}` : "Copy"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
