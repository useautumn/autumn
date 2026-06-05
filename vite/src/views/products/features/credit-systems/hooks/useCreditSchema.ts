import type { CreditSchemaItem, Feature } from "@autumn/shared";
import { FeatureType, isAiCreditSystem } from "@autumn/shared";
import { useStore } from "@tanstack/react-form";
import { useMemo, useRef } from "react";
import { toast } from "sonner";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import type { CreditSystemFormInstance } from "./useCreditSystemForm";

export function useCreditSchema(form: CreditSystemFormInstance) {
	const { features } = useFeaturesQuery();
	const config = useStore(form.store, (s) => s.values.config);
	const schema: CreditSchemaItem[] = config?.schema || [];

	const schemaKeysRef = useRef<string[]>([]);
	const schemaKeys = useMemo(() => {
		const nextKeys = [...schemaKeysRef.current];
		while (nextKeys.length < schema.length) nextKeys.push(crypto.randomUUID());
		while (nextKeys.length > schema.length) nextKeys.pop();
		schemaKeysRef.current = nextKeys;
		return nextKeys;
	}, [schema.length]);

	const allSchemaCandidateFeatures = features.filter(
		(f: Feature) =>
			f.type === FeatureType.Metered || isAiCreditSystem(f.type),
	);

	const handleSchemaChange = (
		index: number,
		key: keyof CreditSchemaItem,
		value: string | number,
	) => {
		const newSchema = [...schema];
		newSchema[index] = { ...newSchema[index], [key]: value };
		form.setFieldValue("config", { ...config, schema: newSchema });
	};

	const addSchemaItem = () => {
		schemaKeysRef.current = [...schemaKeysRef.current, crypto.randomUUID()];
		form.setFieldValue("config", {
			...config,
			schema: [
				...schema,
				{ metered_feature_id: "", feature_amount: 1, credit_amount: 0 },
			],
		});
	};

	const removeSchemaItem = (index: number) => {
		if (schema.length === 1) {
			toast.error("There must be at least one item in the credit system");
			return;
		}
		const nextKeys = [...schemaKeysRef.current];
		nextKeys.splice(index, 1);
		schemaKeysRef.current = nextKeys;
		const newSchema = [...schema];
		newSchema.splice(index, 1);
		form.setFieldValue("config", { ...config, schema: newSchema });
	};

	return {
		schema,
		schemaKeys,
		allSchemaCandidateFeatures,
		handleSchemaChange,
		addSchemaItem,
		removeSchemaItem,
	};
}
