import type { Feature } from "@autumn/shared";
import { Sheet, SheetContent, ShortcutButton } from "@autumn/ui";
import { useStore } from "@tanstack/react-form";
import type { AxiosError } from "axios";
import { useState } from "react";
import { toast } from "sonner";
import {
	SheetFooter,
	SheetHeader,
} from "@/components/v2/sheets/SharedSheetComponents";
import { useUpdateCatalogMutation } from "@/hooks/queries/catalog/useUpdateCatalogMutation";
import { getBackendErr } from "@/utils/genUtils";
import { FeatureStripeProductConfirmDialog } from "../../../plan/components/new-feature/FeatureStripeProductConfirmDialog";
import { NewFeatureAdvanced } from "../../../plan/components/new-feature/NewFeatureAdvanced";
import { featureToCatalogFeatureParams } from "../../utils/buildFeatureMutationParams";
import { featureStripeProductChanged } from "../../utils/featureStripeProductChanged";
import { useCreditSystemForm } from "../hooks/useCreditSystemForm";
import { validateCreditSystem } from "../utils/validateCreditSystem";
import { CreditSystemDetails } from "./CreditSystemDetails";
import { CreditSystemSchema } from "./CreditSystemSchema";

interface UpdateCreditSystemSheetProps {
	open: boolean;
	setOpen: (open: boolean) => void;
	selectedCreditSystem: Feature | null;
	onSuccess?: (oldId: string, newId: string) => void;
}

function UpdateCreditSystemSheet({
	open,
	setOpen,
	selectedCreditSystem,
	onSuccess,
}: UpdateCreditSystemSheetProps) {
	const { mutateAsync: updateCatalog } = useUpdateCatalogMutation();
	const [confirmOpen, setConfirmOpen] = useState(false);

	const form = useCreditSystemForm({
		feature: open ? selectedCreditSystem : null,
		onSubmit: async (values) => {
			if (!selectedCreditSystem) return;

			const creditSystem = {
				name: values.name,
				id: values.id,
				type: values.type,
				config: values.config,
				event_names: values.event_names,
				model_markups: values.model_markups,
			};

			const validationError = validateCreditSystem(creditSystem);
			if (validationError) {
				toast.error(validationError);
				return;
			}

			await updateCatalog({
				features: [
					featureToCatalogFeatureParams({
						feature: {
							id: values.id,
							name: values.name,
							type: values.type,
							config: {
								...values.config,
								default_markup: values.defaultMarkup,
								provider_markups: values.provider_markups,
							},
							event_names: values.event_names,
							model_markups: values.model_markups,
							stripe_product_id: values.stripe_product_id,
						},
						featureId: selectedCreditSystem.id,
						newFeatureId: values.id,
						originalStripeProductId: selectedCreditSystem.stripe_product_id,
					}),
				],
			});

			toast.success("Credit system updated successfully");
			onSuccess?.(
				selectedCreditSystem.id,
				values.id || selectedCreditSystem.id,
			);
			setConfirmOpen(false);
			setOpen(false);
		},
	});

	const isSubmitting = useStore(form.store, (s) => s.isSubmitting);
	const values = useStore(form.store, (s) => s.values);

	return (
		<Sheet open={open} onOpenChange={setOpen}>
			<SheetContent
				key={selectedCreditSystem?.internal_id}
				className="flex flex-col overflow-hidden md:max-w-2xl"
			>
				<SheetHeader
					title="Update Credit System"
					description="Modify how this credit system is configured"
				/>

				<div className="flex-1 overflow-y-auto">
					<CreditSystemDetails form={form} />
					<CreditSystemSchema form={form} disableModeSwitch />
					<NewFeatureAdvanced
						feature={{
							id: values.id,
							name: values.name,
							type: values.type,
							config: values.config,
							event_names: values.event_names,
							stripe_product_id: values.stripe_product_id,
						}}
						setFeature={(next) =>
							form.setFieldValue(
								"stripe_product_id",
								next.stripe_product_id ?? null,
							)
						}
					/>
				</div>

				<SheetFooter>
					<ShortcutButton
						variant="secondary"
						className="w-full"
						onClick={() => setOpen(false)}
						singleShortcut="escape"
					>
						Cancel
					</ShortcutButton>
					<ShortcutButton
						className="w-full"
						onClick={() => {
							if (
								featureStripeProductChanged({
									from: selectedCreditSystem?.stripe_product_id,
									to: values.stripe_product_id,
								})
							) {
								setConfirmOpen(true);
								return;
							}

							form.handleSubmit().catch((err: AxiosError) => {
								toast.error(
									getBackendErr(err, "Failed to update credit system"),
								);
							});
						}}
						metaShortcut="enter"
						isLoading={isSubmitting}
					>
						Update credit system
					</ShortcutButton>
				</SheetFooter>
				<FeatureStripeProductConfirmDialog
					confirmLabel="Update credit system"
					isSaving={isSubmitting}
					onConfirm={() =>
						form.handleSubmit().catch((err: AxiosError) => {
							toast.error(getBackendErr(err, "Failed to update credit system"));
						})
					}
					onOpenChange={setConfirmOpen}
					open={confirmOpen}
				/>
			</SheetContent>
		</Sheet>
	);
}

export default UpdateCreditSystemSheet;
