import type { Feature } from "@autumn/shared";
import { Sheet, SheetContent, ShortcutButton } from "@autumn/ui";
import { useStore } from "@tanstack/react-form";
import type { AxiosError } from "axios";
import { toast } from "sonner";
import {
	SheetFooter,
	SheetHeader,
} from "@/components/v2/sheets/SharedSheetComponents";
import { useUpdateCatalogMutation } from "@/hooks/queries/catalog/useUpdateCatalogMutation";
import { getBackendErr } from "@/utils/genUtils";
import { useSheetBrowserBack } from "../../hooks/useSheetBrowserBack";
import { featureToCatalogFeatureParams } from "../../utils/buildFeatureMutationParams";
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

/**
 * The form is keyed on the credit system being edited, so every open starts
 * from that system's saved values rather than a form another one touched.
 */
function UpdateCreditSystemForm({
	creditSystem,
	setOpen,
	onSuccess,
}: {
	creditSystem: Feature;
	setOpen: (open: boolean) => void;
	onSuccess?: (oldId: string, newId: string) => void;
}) {
	const { mutateAsync: updateCatalog } = useUpdateCatalogMutation();

	const form = useCreditSystemForm({
		feature: creditSystem,
		onSubmit: async (values) => {
			const validationError = validateCreditSystem({
				name: values.name,
				id: values.id,
				type: values.type,
				config: values.config,
				event_names: values.event_names,
				model_markups: values.model_markups,
			});
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
						},
						featureId: creditSystem.id,
						newFeatureId: values.id,
					}),
				],
			});

			toast.success("Credit system updated successfully");
			onSuccess?.(creditSystem.id, values.id || creditSystem.id);
			setOpen(false);
		},
	});

	const isSubmitting = useStore(form.store, (s) => s.isSubmitting);

	return (
		<>
			<div className="flex-1 overflow-y-auto">
				<CreditSystemDetails form={form} />
				<CreditSystemSchema form={form} disableModeSwitch />
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
					onClick={() =>
						form.handleSubmit().catch((err: AxiosError) => {
							toast.error(getBackendErr(err, "Failed to update credit system"));
						})
					}
					metaShortcut="enter"
					isLoading={isSubmitting}
				>
					Update credit system
				</ShortcutButton>
			</SheetFooter>
		</>
	);
}

function UpdateCreditSystemSheet({
	open,
	setOpen,
	selectedCreditSystem,
	onSuccess,
}: UpdateCreditSystemSheetProps) {
	useSheetBrowserBack({ enabled: open });

	return (
		<Sheet open={open} onOpenChange={setOpen}>
			<SheetContent className="flex flex-col overflow-hidden md:max-w-2xl">
				<SheetHeader
					title="Update Credit System"
					description="Modify how this credit system is configured"
				/>
				{open && selectedCreditSystem && (
					<UpdateCreditSystemForm
						key={selectedCreditSystem.internal_id}
						creditSystem={selectedCreditSystem}
						setOpen={setOpen}
						onSuccess={onSuccess}
					/>
				)}
			</SheetContent>
		</Sheet>
	);
}

export default UpdateCreditSystemSheet;
