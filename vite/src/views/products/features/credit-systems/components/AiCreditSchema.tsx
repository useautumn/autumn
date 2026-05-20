import { PlusIcon } from "lucide-react";
import { useMemo } from "react";
import { useStore } from "@tanstack/react-form";
import { FormLabel } from "@/components/v2/form/FormLabel";
import { Input } from "@/components/v2/inputs/Input";
import { SearchableSelect } from "@/components/v2/selects/SearchableSelect";
import { useModelsDevPricing } from "@/hooks/queries/useAiModelsQuery";
import type { CreditSystemFormInstance } from "../hooks/useCreditSystemForm";
import { AiCreditSchemaTable } from "./AiCreditSchemaTable";

interface AiCreditSchemaProps {
	form: CreditSystemFormInstance;
}

function groupByProvider(markups: Record<string, unknown>) {
	const groups: Record<string, string[]> = {};
	for (const fullId of Object.keys(markups)) {
		const [provider] = fullId.split("/");
		(groups[provider] ??= []).push(fullId);
	}
	return groups;
}

export function AiCreditSchema({ form }: AiCreditSchemaProps) {
	const { providers, isLoading } = useModelsDevPricing();
	const modelMarkups = useStore(form.store, (s) => s.values.model_markups);
	const defaultMarkup = useStore(form.store, (s) => s.values.defaultMarkup);

	const providerGroups = useMemo(() => groupByProvider(modelMarkups), [modelMarkups]);
	const activeProviderKeys = Object.keys(providerGroups);

	const availableProviders = useMemo(() => {
		const filtered = Object.values(providers).filter(
			(p) => !activeProviderKeys.includes(p.id),
		);
		if (!activeProviderKeys.includes("custom")) {
			filtered.push({ id: "custom", name: "Custom", models: {} });
		}
		return filtered;
	}, [providers, activeProviderKeys]);

	const addProvider = (providerKey: string) => {
		form.setFieldValue("model_markups", (prev) => {
			if (providerKey === "custom") {
				const existing = Object.keys(prev).filter((k) => k.startsWith("custom/"));
				let i = 1;
				while (existing.includes(`custom/model-${i}`)) i++;
				return { ...prev, [`custom/model-${i}`]: { input_cost: 0, output_cost: 0 } };
			}
			const provider = providers[providerKey];
			if (!provider) return prev;
			const firstKey = Object.keys(provider.models)[0];
			if (!firstKey) return prev;
			return { ...prev, [`${providerKey}/${firstKey}`]: {} };
		});
	};

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-1.5">
				<FormLabel>Default Markup %</FormLabel>
				<Input
					type="text"
					inputMode="numeric"
					value={defaultMarkup === 0 ? "" : String(defaultMarkup)}
					onChange={(e) => {
						const raw = e.target.value;
						if (raw === "" || /^-?\d*\.?\d*$/.test(raw)) {
							form.setFieldValue("defaultMarkup", raw === "" ? 0 : Number(raw));
						}
					}}
					placeholder="0"
				/>
			</div>

			<div className="flex flex-col gap-3">
				{activeProviderKeys.map((providerKey) => {
					const provider = providers[providerKey];
					const modelFullIds = providerGroups[providerKey] ?? [];
					const providerName =
						provider?.name ?? providerKey.charAt(0).toUpperCase() + providerKey.slice(1);

					return (
						<AiCreditSchemaTable
							key={providerKey}
							form={form}
							providerKey={providerKey}
							providerName={providerName}
							modelFullIds={modelFullIds}
							provider={provider ?? { id: providerKey, name: providerKey, models: {} }}
							isLoading={isLoading}
						/>
					);
				})}
			</div>

			<div className="flex flex-col gap-1.5" onWheel={(e) => e.stopPropagation()}>
				<FormLabel>Add Provider</FormLabel>
				<SearchableSelect
					value={null}
					onValueChange={addProvider}
					options={availableProviders}
					getOptionValue={(p) => p.id}
					getOptionLabel={(p) => p.name}
					renderValue={() => (
						<span className="text-tertiary-foreground">Select provider</span>
					)}
					placeholder="Select provider"
					searchable
					searchPlaceholder="Search providers..."
					emptyText="No providers available"
					disabled={isLoading}
				/>
			</div>
		</div>
	);
}
