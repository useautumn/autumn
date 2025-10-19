import type { CreateFeature } from "@autumn/shared";
import { FeatureType, FeatureUsageType } from "@autumn/shared";
import type { AxiosError } from "axios";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ShortcutButton } from "@/components/v2/buttons/ShortcutButton";
import {
	SheetFooter,
	SheetHeader,
} from "@/components/v2/sheets/SharedSheetComponents";
import {
	Sheet,
	SheetContent,
	SheetTrigger,
} from "@/components/v2/sheets/Sheet";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { FeatureService } from "@/services/FeatureService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { validateCreditSystem } from "../utils/validateCreditSystem";
import { CreditSystemDetails } from "./CreditSystemDetails";
import { CreditSystemSchema } from "./CreditSystemSchema";

const defaultCreditSystem: CreateFeature = {
	name: "",
	id: "",
	type: FeatureType.CreditSystem,
	config: {
		schema: [{ metered_feature_id: "", feature_amount: 1, credit_amount: 0 }],
		usage_type: FeatureUsageType.Single,
	},
	event_names: [],
};

export function CreateCreditSystemSheet() {
	const { refetch } = useFeaturesQuery();
	const axiosInstance = useAxiosInstance();

	const [loading, setLoading] = useState(false);
	const [open, setOpen] = useState(false);
	const [creditSystem, setCreditSystem] =
		useState<CreateFeature>(defaultCreditSystem);

	useEffect(() => {
		if (open) {
			setCreditSystem(defaultCreditSystem);
		}
	}, [open]);

	const handleCreateCreditSystem = async () => {
		const validationError = validateCreditSystem(creditSystem);
		if (validationError) {
			toast.error(validationError);
			return;
		}

		setLoading(true);
		try {
			await FeatureService.createFeature(axiosInstance, {
				name: creditSystem.name,
				id: creditSystem.id,
				type: FeatureType.CreditSystem,
				config: creditSystem.config,
				event_names: creditSystem.event_names,
			});
			await refetch();
			toast.success("Credit system created successfully");
			setOpen(false);
		} catch (error: unknown) {
			toast.error(
				getBackendErr(error as AxiosError, "Failed to create credit system"),
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
			<SheetTrigger asChild>
				<Button variant="add">Credit System</Button>
			</SheetTrigger>
			<SheetContent className="flex flex-col overflow-hidden">
				<SheetHeader
					title="Create Credit System"
					description="Configure how credits are consumed"
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
						onClick={handleCreateCreditSystem}
						metaShortcut="enter"
						isLoading={loading}
					>
						Create credit system
					</ShortcutButton>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
