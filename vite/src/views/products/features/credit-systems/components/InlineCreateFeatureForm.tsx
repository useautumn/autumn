import { FeatureType } from "@autumn/shared";
import { Button, FormLabel, Input } from "@autumn/ui";
import type { AxiosError } from "axios";
import { forwardRef, useCallback, useState } from "react";
import { toast } from "sonner";
import { useAutoSlug } from "@/hooks/common/useAutoSlug";
import { useUpdateCatalogMutation } from "@/hooks/queries/catalog/useUpdateCatalogMutation";
import { getBackendErr } from "@/utils/genUtils";

export const InlineCreateFeatureForm = forwardRef<
	HTMLInputElement,
	{
		onCreated: (featureId: string) => void;
	}
>(({ onCreated }, ref) => {
	const [newFeature, setNewFeature] = useState({ name: "", id: "" });
	const { mutateAsync: updateCatalog, isPending } = useUpdateCatalogMutation();

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

		try {
			await updateCatalog({
				features: [
					{
						feature_id: newFeature.id,
						name: newFeature.name,
						type: FeatureType.Metered,
						consumable: true,
					},
				],
			});

			onCreated(newFeature.id);
			toast.success("Feature created");
		} catch (error: unknown) {
			toast.error(
				getBackendErr(error as AxiosError, "Failed to create feature"),
			);
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
			<Button className="w-full" onClick={handleCreate} isLoading={isPending}>
				Create
			</Button>
		</div>
	);
});
