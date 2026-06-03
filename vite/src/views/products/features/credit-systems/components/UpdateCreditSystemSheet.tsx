import type { CreditSchemaItem, Feature } from "@autumn/shared";
import { FeatureType } from "@autumn/shared";
import { useStore } from "@tanstack/react-form";
import type { AxiosError } from "axios";
import { toast } from "sonner";
import { ShortcutButton } from "@/components/v2/buttons/ShortcutButton";
import {
	SheetFooter,
	SheetHeader,
} from "@/components/v2/sheets/SharedSheetComponents";
import { Sheet, SheetContent } from "@/components/v2/sheets/Sheet";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { FeatureService } from "@/services/FeatureService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
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
	const axiosInstance = useAxiosInstance();
	const { refetch } = useFeaturesQuery();

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

			const isAiCreditSystem = values.type === FeatureType.AiCreditSystem;

			await FeatureService.updateFeature(
				axiosInstance,
				selectedCreditSystem.id,
				{
					id: values.id,
					name: values.name,
					type: values.type,
					model_markups: isAiCreditSystem ? values.model_markups : undefined,
					default_markup: isAiCreditSystem ? values.defaultMarkup : undefined,
					provider_markups: isAiCreditSystem
						? values.provider_markups
						: undefined,
					credit_schema: isAiCreditSystem
						? undefined
						: values.config?.schema?.map((x: CreditSchemaItem) => ({
								metered_feature_id: x.metered_feature_id,
								credit_cost:
									x.credit_amount != null ? Number(x.credit_amount) : 0,
							})),
					event_names: values.event_names,
					display: undefined,
				},
			);

			await refetch();
			toast.success("Credit system updated successfully");
			onSuccess?.(
				selectedCreditSystem.id,
				values.id || selectedCreditSystem.id,
			);
			setOpen(false);
		},
	});

	const isSubmitting = useStore(form.store, (s) => s.isSubmitting);

	return (
		<Sheet open={open} onOpenChange={setOpen}>
			<SheetContent
				key={selectedCreditSystem?.internal_id}
				className="flex flex-col overflow-hidden md:max-w-xl"
			>
				<SheetHeader
					title="Update Credit System"
					description="Modify how this credit system is configured"
				/>

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
								toast.error(
									getBackendErr(err, "Failed to update credit system"),
								);
							})
						}
						metaShortcut="enter"
						isLoading={isSubmitting}
					>
						Update credit system
					</ShortcutButton>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}

export default UpdateCreditSystemSheet;
