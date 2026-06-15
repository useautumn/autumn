import {
	joinModelId,
	type ModelsDevProvider,
	splitModelId,
} from "@autumn/shared";
import { useStore } from "@tanstack/react-form";
import { useMemo } from "react";
import { useModelsDevPricing } from "@/hooks/queries/useAiModelsQuery";
import { addCustomModelMarkup } from "../utils/modelMarkupUtils";
import type { CreditSystemFormInstance } from "./useCreditSystemForm";

function groupByProvider(markups: Record<string, unknown>) {
	const groups: Record<string, string[]> = {};
	for (const fullId of Object.keys(markups)) {
		const { provider } = splitModelId(fullId);
		if (!provider) continue;
		const group = groups[provider] ?? [];
		group.push(fullId);
		groups[provider] = group;
	}
	return groups;
}

export function useAiProviders(form: CreditSystemFormInstance) {
	const { providers, isLoading } = useModelsDevPricing();
	const modelMarkups = useStore(form.store, (s) => s.values.model_markups);
	const defaultMarkup = useStore(form.store, (s) => s.values.defaultMarkup);
	const providerMarkups = useStore(
		form.store,
		(s) => s.values.provider_markups,
	);

	const providerGroups = useMemo(
		() => groupByProvider(modelMarkups),
		[modelMarkups],
	);
	// A provider is "active" if it has model overrides OR a provider-level markup.
	const activeProviderKeys = useMemo(
		() =>
			Array.from(
				new Set([
					...Object.keys(providerGroups),
					...Object.keys(providerMarkups),
				]),
			),
		[providerGroups, providerMarkups],
	);

	const availableProviders = useMemo(() => {
		const filtered = Object.values(providers).filter(
			(p) => !activeProviderKeys.includes(p.id),
		);
		if (!activeProviderKeys.includes("custom")) {
			filtered.push({
				id: "custom",
				name: "Custom",
				models: {},
			} as ModelsDevProvider);
		}
		return filtered;
	}, [providers, activeProviderKeys]);

	const addProvider = (providerKey: string) => {
		form.setFieldValue("model_markups", (prev) => {
			if (providerKey === "custom") {
				return addCustomModelMarkup(prev);
			}
			const provider = providers[providerKey];
			if (!provider) return prev;
			const firstKey = Object.keys(provider.models)[0];
			if (!firstKey) return prev;
			return { ...prev, [joinModelId(providerKey, firstKey)]: {} };
		});
	};

	const removeKeys = (keys: string[]) =>
		form.setFieldValue("model_markups", (prev) => {
			const updated = { ...prev };
			for (const k of keys) delete updated[k];
			return updated;
		});

	const setProviderMarkup = (providerKey: string, value: number | undefined) =>
		form.setFieldValue("provider_markups", (prev) => {
			const updated = { ...prev };
			if (value == null) {
				delete updated[providerKey];
			} else {
				updated[providerKey] = { markup: value };
			}
			return updated;
		});

	// Removes the whole provider section: all its model overrides and its markup.
	const removeProvider = (providerKey: string) => {
		form.setFieldValue("model_markups", (prev) => {
			const updated = { ...prev };
			for (const k of Object.keys(updated)) {
				if (splitModelId(k).provider === providerKey) delete updated[k];
			}
			return updated;
		});
		setProviderMarkup(providerKey, undefined);
	};

	const renameKey = (oldKey: string, newKey: string) =>
		form.setFieldValue("model_markups", (prev) => {
			if (newKey in prev) return prev;
			const updated = { ...prev };
			const entry = updated[oldKey];
			delete updated[oldKey];
			updated[newKey] = { ...entry };
			return updated;
		});

	return {
		providers,
		isLoading,
		defaultMarkup,
		providerMarkups,
		providerGroups,
		activeProviderKeys,
		availableProviders,
		addProvider,
		removeKeys,
		removeProvider,
		setProviderMarkup,
		renameKey,
	};
}
