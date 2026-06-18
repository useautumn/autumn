import type { Feature } from "@autumn/shared";
import { FeatureUsageType } from "@autumn/shared";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import { ShortcutButton } from "@/components/v2/buttons/ShortcutButton";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/v2/dialogs/Dialog";
import { LabelInput } from "@/components/v2/inputs/LabelInput";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/v2/selects/Select";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useCustomerContext } from "../CustomerContext";

export const CreateEntity = ({
	open,
	setOpen,
	onCreated,
}: {
	open: boolean;
	setOpen: (open: boolean) => void;
	onCreated?: () => void;
}) => {
	const { customer, refetch } = useCusQuery();
	const { setEntityId } = useCustomerContext();
	const navigate = useNavigate();
	const location = useLocation();
	const { features } = useFeaturesQuery();

	const [isLoading, setIsLoading] = useState(false);
	const [entity, setEntity] = useState<{
		id: string;
		name: string;
		feature_id: string;
	}>({
		id: "",
		name: "",
		feature_id: "",
	});

	const axiosInstance = useAxiosInstance();

	// Reset form when dialog closes
	useEffect(() => {
		if (!open) {
			setEntity({
				id: "",
				name: "",
				feature_id: "",
			});
		}
	}, [open]);

	const handleCreateClicked = async () => {
		if (!entity.feature_id) {
			toast.error("Please select a feature");
			return;
		}

		setIsLoading(true);
		try {
			const { data } = await axiosInstance.post(
				`/v1/customers/${
					customer.id || customer.internal_id
				}/entities?with_autumn_id=true`,
				{
					id: entity.id || null,
					name: entity.name || null,
					feature_id: entity.feature_id,
					customer_id: customer.id,
				},
			);

			await refetch();
			onCreated?.();
			setOpen(false);

			const params = new URLSearchParams(location.search);
			const entityId = data.id || data.autumn_id;
			params.set("entity_id", entityId);
			navigate(`${location.pathname}?${params.toString()}`);
			setEntityId(entityId);

			toast.success("Entity created successfully");
		} catch (error) {
			console.log(error);
			toast.error(getBackendErr(error, "Failed to create entity"));
		} finally {
			setIsLoading(false);
		}
	};

	const continuousFeatures =
		features?.filter(
			(feature: Feature) =>
				feature.config?.usage_type === FeatureUsageType.Continuous,
		) || [];
	const hasContinuousFeatures = continuousFeatures.length > 0;

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent className="w-[400px] bg-card">
				<DialogHeader>
					<DialogTitle>Create Entity</DialogTitle>
					<DialogDescription>
						Create an entity under this customer to grant plans and balances to
						a child resource.
					</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-4">
					<div className="flex gap-2">
						<LabelInput
							label="Name"
							placeholder="Enter name"
							value={entity.name}
							onChange={(e) => setEntity({ ...entity, name: e.target.value })}
							className="flex-1"
						/>
						<LabelInput
							label="ID"
							placeholder="Enter ID"
							value={entity.id}
							onChange={(e) => setEntity({ ...entity, id: e.target.value })}
							className="flex-1"
						/>
					</div>
					<div>
						<div className="text-form-label block mb-1">Feature ID</div>
					<Select
						value={entity.feature_id}
						onValueChange={(value) =>
							setEntity({ ...entity, feature_id: value })
						}
						items={Object.fromEntries(continuousFeatures.map((feature: Feature) => [feature.id, feature.name]))}
					>
						<SelectTrigger className="w-full">
							<SelectValue placeholder="Select feature" />
						</SelectTrigger>
							<SelectContent>
								{hasContinuousFeatures ? (
									continuousFeatures.map((feature: Feature) => (
										<SelectItem key={feature.id} value={feature.id}>
											{feature.name}
										</SelectItem>
									))
								) : (
									<div className="px-2 py-1.5 text-sm text-muted-foreground">
										Create a non-consumable feature first (e.g. seats,
										projects)
									</div>
								)}
							</SelectContent>
						</Select>
					</div>
				</div>

				<DialogFooter>
					<ShortcutButton
						onClick={handleCreateClicked}
						isLoading={isLoading}
						variant="primary"
						metaShortcut="enter"
						className="w-full"
					>
						Create Entity
					</ShortcutButton>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
