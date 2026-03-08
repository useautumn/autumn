import type { CreateFeature } from "@autumn/shared";
import { PlusIcon } from "@phosphor-icons/react";
import { useCallback, useRef, useState } from "react";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { FormLabel } from "@/components/v2/form/FormLabel";
import { Input } from "@/components/v2/inputs/Input";
import { useOpenRouterModels } from "@/hooks/queries/useOpenRouterModels";
import { AiCreditSchemaRow } from "./AiCreditSchemaRow";

interface AiCreditSchemaProps {
	creditSystem: CreateFeature;
	setCreditSystem: (creditSystem: CreateFeature) => void;
}

export function AiCreditSchema({
	creditSystem,
	setCreditSystem,
}: AiCreditSchemaProps) {
	const { models, isLoading: modelsLoading } = useOpenRouterModels();
	const modelMarkups = creditSystem.model_markups ?? {};
	const modelIds = Object.keys(modelMarkups);

	const [defaultMarkup, setDefaultMarkup] = useState<number>(0);
	const manuallyEditedModels = useRef<Set<string>>(new Set());

	const handleModelChange = (oldModelId: string, newModelId: string) => {
		const updatedMarkups = { ...modelMarkups };
		const markup = updatedMarkups[oldModelId]?.markup ?? 0;
		if (manuallyEditedModels.current.has(oldModelId)) {
			manuallyEditedModels.current.delete(oldModelId);
			manuallyEditedModels.current.add(newModelId);
		}
		delete updatedMarkups[oldModelId];
		updatedMarkups[newModelId] = { markup };
		setCreditSystem({ ...creditSystem, model_markups: updatedMarkups });
	};

	const handleMarkupChange = (modelId: string, markup: number) => {
		manuallyEditedModels.current.add(modelId);
		setCreditSystem({
			...creditSystem,
			model_markups: {
				...modelMarkups,
				[modelId]: { markup },
			},
		});
	};

	const handleDefaultMarkupChange = useCallback(
		(value: number) => {
			setDefaultMarkup(value);
			const updatedMarkups = { ...modelMarkups };
			for (const modelId of Object.keys(updatedMarkups)) {
				if (!manuallyEditedModels.current.has(modelId)) {
					updatedMarkups[modelId] = { markup: value };
				}
			}
			setCreditSystem({ ...creditSystem, model_markups: updatedMarkups });
		},
		[modelMarkups, creditSystem, setCreditSystem],
	);

	const handleRemove = (modelId: string) => {
		manuallyEditedModels.current.delete(modelId);
		const updatedMarkups = { ...modelMarkups };
		delete updatedMarkups[modelId];
		setCreditSystem({ ...creditSystem, model_markups: updatedMarkups });
	};

	const addModel = () => {
		const usedIds = new Set(modelIds);
		const nextModel = models.find((m) => !usedIds.has(m.id));
		const newModelId = nextModel?.id ?? "";
		if (!newModelId || modelMarkups[newModelId] !== undefined) return;
		setCreditSystem({
			...creditSystem,
			model_markups: {
				...modelMarkups,
				[newModelId]: { markup: defaultMarkup },
			},
		});
	};

	return (
		<div className="flex flex-col gap-0">
			<div className="flex items-center gap-2 mb-3">
				<FormLabel className="whitespace-nowrap">Default Markup %</FormLabel>
				<Input
					type="number"
					lang="en"
					value={defaultMarkup}
					onChange={(e) =>
						handleDefaultMarkupChange(Number(e.target.value) || 0)
					}
					onBlur={(e) => handleDefaultMarkupChange(Number(e.target.value) || 0)}
					placeholder="0"
					className="w-24"
				/>
			</div>

			<div className="hidden lg:grid lg:grid-cols-[minmax(0,2fr)_auto_auto_auto_auto_auto_auto] gap-2 mb-1">
				<FormLabel className="truncate">Model</FormLabel>
				<FormLabel className="w-24">Actual In</FormLabel>
				<FormLabel className="w-24">Actual Out</FormLabel>
				<FormLabel className="w-20">Markup %</FormLabel>
				<FormLabel className="w-24">User In</FormLabel>
				<FormLabel className="w-24">User Out</FormLabel>
				<div className="w-8" />
			</div>
			<div className="flex flex-col gap-2">
				{modelIds.map((modelId) => (
					<AiCreditSchemaRow
						key={modelId}
						modelId={modelId}
						markup={modelMarkups[modelId]?.markup ?? 0}
						models={models}
						isLoading={modelsLoading}
						onModelChange={handleModelChange}
						onMarkupChange={handleMarkupChange}
						onRemove={handleRemove}
					/>
				))}
			</div>
			<p className="hidden lg:block text-xs text-t-tertiary my-2">
				All prices are in $/M tokens
			</p>

			<IconButton
				variant="muted"
				onClick={addModel}
				className="w-fit mt-4"
				icon={<PlusIcon />}
			>
				Add model
			</IconButton>
		</div>
	);
}
