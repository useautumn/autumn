import type { ProductV2 } from "@autumn/shared";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/v2/buttons/Button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/v2/dialogs/Dialog";
import { FormLabel as FieldLabel } from "@/components/v2/form/FormLabel";
import { Input } from "@/components/v2/inputs/Input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/v2/selects/Select";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";

export function SyncInvoiceDialog({
	products,
}: {
	products: ProductV2[];
}) {
	const [open, setOpen] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [stripeInvoiceId, setStripeInvoiceId] = useState("");
	const [selectedProductId, setSelectedProductId] = useState("");
	const [selectedVersion, setSelectedVersion] = useState("");
	const axiosInstance = useAxiosInstance();
	const { customer, refetch } = useCusQuery();

	// Group products by id to find those with multiple versions
	const productGroups = products.reduce(
		(acc, p) => {
			if (!acc[p.id]) acc[p.id] = [];
			acc[p.id].push(p);
			return acc;
		},
		{} as Record<string, ProductV2[]>,
	);

	const selectedProductGroup = selectedProductId
		? productGroups[selectedProductId] || []
		: [];
	const hasMultipleVersions = selectedProductGroup.length > 1;

	// Get the resolved product (by version or the only one)
	const resolvedProduct = hasMultipleVersions
		? selectedProductGroup.find(
				(p) => p.internal_id === selectedVersion,
			)
		: selectedProductGroup[0];

	const handleSync = async () => {
		if (!customer || !resolvedProduct) return;

		setIsLoading(true);
		try {
			await axiosInstance.post(
				`/customers/${customer.id || customer.internal_id}/sync_invoice`,
				{
					stripe_invoice_id: stripeInvoiceId.trim(),
					product_id: resolvedProduct.id,
					internal_product_id: resolvedProduct.internal_id,
					internal_customer_id: customer.internal_id,
				},
			);

			toast.success("Invoice synced successfully");
			setOpen(false);
			setStripeInvoiceId("");
			setSelectedProductId("");
			setSelectedVersion("");
			await refetch();
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to sync invoice"));
		} finally {
			setIsLoading(false);
		}
	};

	// Unique products by id (deduplicated for the dropdown)
	const uniqueProducts = Object.entries(productGroups).map(
		([id, group]) => ({
			id,
			name: group[0].name || id,
		}),
	);

	const canSubmit =
		stripeInvoiceId.trim() &&
		selectedProductId &&
		(!hasMultipleVersions || selectedVersion);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="secondary" size="mini">
					Sync Invoice
				</Button>
			</DialogTrigger>
			<DialogContent className="w-[420px] bg-card">
				<DialogHeader>
					<DialogTitle>Sync an Invoice</DialogTitle>
				</DialogHeader>
				<div className="flex flex-col gap-4">
					<div>
						<FieldLabel>Stripe Invoice ID</FieldLabel>
						<Input
							value={stripeInvoiceId}
							placeholder="in_..."
							onChange={(e) => setStripeInvoiceId(e.target.value)}
						/>
					</div>
					<div>
						<FieldLabel>Product</FieldLabel>
						<Select
							value={selectedProductId}
							onValueChange={(val) => {
								setSelectedProductId(val);
								setSelectedVersion("");
							}}
						>
							<SelectTrigger>
								<SelectValue placeholder="Select a product" />
							</SelectTrigger>
							<SelectContent>
								{uniqueProducts.map((p) => (
									<SelectItem key={p.id} value={p.id}>
										{p.name} ({p.id})
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					{hasMultipleVersions && (
						<div>
							<FieldLabel>Version</FieldLabel>
							<Select
								value={selectedVersion}
								onValueChange={setSelectedVersion}
							>
								<SelectTrigger>
									<SelectValue placeholder="Select a version" />
								</SelectTrigger>
								<SelectContent>
									{selectedProductGroup.map((p) => (
										<SelectItem
											key={p.internal_id}
											value={p.internal_id}
										>
											v{p.version}
											{p.is_default ? " (default)" : ""}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					)}
				</div>
				<DialogFooter>
					<Button
						onClick={handleSync}
						isLoading={isLoading}
						variant="primary"
						disabled={!canSubmit}
					>
						Sync
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
