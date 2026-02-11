import { FeatureType } from "@autumn/shared";
import type { AxiosError } from "axios";
import { forwardRef, useCallback, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/v2/buttons/Button";
import { FormLabel } from "@/components/v2/form/FormLabel";
import { Input } from "@/components/v2/inputs/Input";
import { useAutoSlug } from "@/hooks/common/useAutoSlug";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { FeatureService } from "@/services/FeatureService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";

export const InlineCreateFeatureForm = forwardRef<
	HTMLInputElement,
	{
		onCreated: (featureId: string) => void;
	}
>(({ onCreated }, ref) => {
	const [isCreating, setIsCreating] = useState(false);
	const [newFeature, setNewFeature] = useState({ name: "", id: "" });
	const axiosInstance = useAxiosInstance();
	const { refetch } = useFeaturesQuery();

	const setNewFeatureState = useCallback(
		(
			updater:
				| { name: string; id: string }
				| ((prev: { name: string; id: string }) => {
						name: string;
						id: string;
				  }),
		) => {
			if (typeof updater === "function") {
				setNewFeature((prev) => updater(prev));
			} else {
				setNewFeature(updater);
			}
		},
		[],
	);

	const { setSource, setTarget } = useAutoSlug({
		setState: setNewFeatureState,
		sourceKey: "name",
		targetKey: "id",
	});

	const handleCreate = async () => {
		if (!newFeature.name.trim() || !newFeature.id.trim()) {
			toast.error("Please fill in both name and ID");
			return;
		}

		setIsCreating(true);
		try {
			await FeatureService.createFeature(axiosInstance, {
				name: newFeature.name,
				id: newFeature.id,
				type: FeatureType.Metered,
				consumable: true,
			});

			await refetch();
			onCreated(newFeature.id);
			toast.success("Feature created");
		} catch (error: unknown) {
			toast.error(
				getBackendErr(error as AxiosError, "Failed to create feature"),
			);
		} finally {
			setIsCreating(false);
		}
	};

	return (
		<div
			className="flex flex-col gap-3 p-2"
			onKeyDown={(e) => e.stopPropagation()}
		>
			<div className="flex gap-2">
				<div>
					<FormLabel>Name</FormLabel>
					<Input
						ref={ref}
						placeholder="eg, Chat Messages"
						value={newFeature.name}
						onChange={(e) => setSource(e.target.value)}
					/>
				</div>
				<div>
					<FormLabel>ID</FormLabel>
					<Input
						placeholder="fills automatically"
						value={newFeature.id}
						onChange={(e) => setTarget(e.target.value)}
					/>
				</div>
			</div>
			<Button className="w-full" onClick={handleCreate} isLoading={isCreating}>
				Create
			</Button>
		</div>
	);
});
