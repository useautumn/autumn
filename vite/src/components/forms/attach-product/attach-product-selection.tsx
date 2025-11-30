import { isProductAlreadyEnabled } from "@autumn/shared";
import { PencilSimpleIcon } from "@phosphor-icons/react";
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useHasChanges } from "@/hooks/stores/useProductStore";
import { useEntity } from "@/hooks/stores/useSubscriptionStore";
import { pushPage } from "@/utils/genUtils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import type { UseAttachProductForm } from "./use-attach-product-form";

interface AttachProductSelectionProps {
	form: UseAttachProductForm;
	customerId: string;
}

export function AttachProductSelection({
	form,
	customerId,
}: AttachProductSelectionProps) {
	const { products } = useProductsQuery();
	const availableProducts = products.filter((p) => !p.archived);
	const navigate = useNavigate();
	const productId = form.state.values.productId;
	const hasChanges = useHasChanges();
	const { customer } = useCusQuery();
	const { entityId } = useEntity();
	const previousProductIdRef = useRef<string | undefined>();

	useEffect(() => {
		// Subscribe to form changes and clear prepaid options when productId changes
		// Prevents stale prepaid options from causing "no prepaid price found" in the `checkout` call
		const subscription = form.store.subscribe(() => {
			const currentProductId = form.store.state.values.productId;

			if (
				previousProductIdRef.current !== undefined &&
				previousProductIdRef.current !== currentProductId
			) {
				form.setFieldValue("prepaidOptions", {});
			}
			previousProductIdRef.current = currentProductId;
		});

		return () => subscription();
	}, [form.store]);

	const handleCustomize = ({ productId }: { productId: string }) => {
		if (!productId || !customerId) {
			return;
		}

		pushPage({
			path: `/customers/${customerId}/${productId}`,
			navigate,
		});
	};

	return (
		<div className="space-y-4">
			<div className="grid grid-cols-[1fr_auto] gap-2">
				<form.AppField name="productId">
					{(field) => (
						<field.SelectField
							label=""
							options={availableProducts.map((p) => ({
								label: p.name,
								value: p.id,
								disabledValue: isProductAlreadyEnabled({
									productId: p.id,
									customer,
									entityId: entityId ?? undefined,
								})
									? "Already Enabled"
									: undefined,
							}))}
							placeholder="Select Product"
							hideFieldInfo
							selectValueAfter={
								hasChanges && productId ? (
									<span className="text-xs bg-green-500/10 text-green-500 px-1 py-0 rounded-md">
										Custom
									</span>
								) : undefined
							}
						/>
					)}
				</form.AppField>

				<div className="flex items-center gap-2">
					<form.Subscribe selector={(state) => state.values.productId}>
						{(productId) => (
							<IconButton
								size="sm"
								variant="secondary"
								className="size-6 disabled:pointer-events-none disabled:opacity-50 w-fit"
								icon={<PencilSimpleIcon />}
								onClick={() => handleCustomize({ productId })}
								disabled={!productId}
								type="button"
							>
								Customize
							</IconButton>
						)}
					</form.Subscribe>
				</div>
			</div>
		</div>
	);
}
