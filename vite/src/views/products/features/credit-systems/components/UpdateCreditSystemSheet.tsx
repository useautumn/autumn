import type { CreateFeature, CreditSchemaItem, Feature } from "@autumn/shared";
import { FeatureType } from "@autumn/shared";
import type { AxiosError } from "axios";
import { useEffect, useState } from "react";
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
import { validateCreditSystem } from "../utils/validateCreditSystem";
import { CreditSystemDetails } from "./CreditSystemDetails";
import { CreditSystemSchema } from "./CreditSystemSchema";

interface UpdateCreditSystemSheetProps {
	open: boolean;
	setOpen: (open: boolean) => void;
	selectedCreditSystem: Feature | null;
}

function UpdateCreditSystemSheet({
	open,
	setOpen,
	selectedCreditSystem,
}: UpdateCreditSystemSheetProps) {
	const [loading, setLoading] = useState(false);
	const [creditSystem, setCreditSystem] = useState<CreateFeature>({
		name: "",
		id: "",
		type: FeatureType.CreditSystem,
		config: {
			schema: [
				{
					metered_feature_id: "",
					feature_amount: 1,
					credit_amount: 0,
				},
			],
		},
		event_names: [],
	});

	const axiosInstance = useAxiosInstance();
	const { refetch } = useFeaturesQuery();

	// Initialize credit system when selectedCreditSystem changes
	useEffect(() => {
		if (open && selectedCreditSystem) {
			setCreditSystem({
				name: selectedCreditSystem.name,
				id: selectedCreditSystem.id,
				type: selectedCreditSystem.type,
				config: selectedCreditSystem.config,
				event_names: selectedCreditSystem.event_names,
			});
		}
	}, [open, selectedCreditSystem]);

	const handleUpdateCreditSystem = async () => {
		if (!selectedCreditSystem) return;

		const validationError = validateCreditSystem(creditSystem);
		if (validationError) {
			toast.error(validationError);
			return;
		}

		setLoading(true);
		try {
			await FeatureService.updateFeature(
				axiosInstance,
				selectedCreditSystem.id,
				{
					id: creditSystem.id,
					name: creditSystem.name,
					type: creditSystem.type,
					credit_schema: creditSystem.config?.schema?.map(
						(x: CreditSchemaItem) => ({
							metered_feature_id: x.metered_feature_id,
							credit_cost: Number(x.credit_amount),
						}),
					),
					event_names: creditSystem.event_names,
					display: undefined,
				},
			);

			await refetch();
			toast.success("Credit system updated successfully");
			setOpen(false);
		} catch (error: unknown) {
			console.log(error);
			toast.error(
				getBackendErr(error as AxiosError, "Failed to update credit system"),
			);
		} finally {
			setLoading(false);
		}
	};

	const handleCancel = () => {
		setOpen(false);
	};

	return (
		<Sheet open={open} onOpenChange={setOpen}>
			<SheetContent className="flex flex-col overflow-hidden">
				<SheetHeader
					title="Update Credit System"
					description="Modify how this credit system is configured"
				/>

				<div className="flex-1 overflow-y-auto">
					<CreditSystemDetails
						creditSystem={creditSystem}
						setCreditSystem={setCreditSystem}
					/>
					<CreditSystemSchema
						creditSystem={creditSystem}
						setCreditSystem={setCreditSystem}
					/>
				</div>

				<SheetFooter>
					<ShortcutButton
						variant="secondary"
						className="w-full"
						onClick={handleCancel}
						singleShortcut="escape"
					>
						Cancel
					</ShortcutButton>
					<ShortcutButton
						className="w-full"
						onClick={handleUpdateCreditSystem}
						metaShortcut="enter"
						isLoading={loading}
					>
						Update credit system
					</ShortcutButton>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}

export default UpdateCreditSystemSheet;
