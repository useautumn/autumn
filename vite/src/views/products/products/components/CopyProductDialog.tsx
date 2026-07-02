import { AppEnv, type ProductV2 } from "@autumn/shared";
import {
	Button,
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	FormLabel,
	Input,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@autumn/ui";
import type { AxiosError } from "axios";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useActiveSandbox } from "@/hooks/sandbox/useActiveSandbox";
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
	const activeSandbox = useActiveSandbox();
	const { refetch } = useProductsQuery();
	const navigate = useNavigate();

	// Inside a named sandbox, "Copy to Sandbox/Production" promotes into the
	// master org (a different org), so a same-env same-id copy isn't a collision.
	const inNamedSandbox = env === AppEnv.Sandbox && !!activeSandbox;

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
		// 1. If Name and Id is empty, throw error
		if (!name || !id) {
			if (!name) toast.error("Name cannot be empty");
			else toast.error("ID cannot be empty");
			return;
		}
		// 2. Same-org same-env copy with an unchanged id would collide (skip this
		// when promoting from a named sandbox — the target is the master org).
		if (!inNamedSandbox && env === effectiveEnv && id === product.id) {
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
			} else if (!inNamedSandbox && env === effectiveEnv) {
				// Same-org duplicate lands in this view; a promote goes to another
				// org, so don't navigate to a same-id plan in the current context.
				navigateTo(`/products/${id}`, navigate);
			}
		} catch (error: unknown) {
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
								items={{
									[AppEnv.Live]: "Production",
									[AppEnv.Sandbox]: "Sandbox",
								}}
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
