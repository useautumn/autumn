import type { CreditSchemaItem, Feature } from "@autumn/shared";
import { FeatureType, isAiCreditSystem } from "@autumn/shared";
import { useStore } from "@tanstack/react-form";
import { useMemo, useRef } from "react";
import { toast } from "sonner";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { createSchemaItem } from "../utils/creditSchemaUtils";
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
		(f: Feature) => f.type === FeatureType.Metered || isAiCreditSystem(f.type),
	);

	const setSchema = (newSchema: CreditSchemaItem[]) =>
		form.setFieldValue("config", { ...config, schema: newSchema });

	const setSchemaItem = ({
		index,
		item,
	}: {
		index: number;
		item: CreditSchemaItem;
	}) => setSchema(schema.map((existing, i) => (i === index ? item : existing)));

	const addSchemaItem = () => {
		schemaKeysRef.current = [...schemaKeysRef.current, crypto.randomUUID()];
		setSchema([...schema, createSchemaItem()]);
	};

	const removeSchemaItem = (index: number) => {
		if (schema.length === 1) {
			toast.error("There must be at least one item in the credit system");
			return;
		}
		schemaKeysRef.current = schemaKeysRef.current.filter((_, i) => i !== index);
		setSchema(schema.filter((_, i) => i !== index));
	};

	return {
		schema,
		schemaKeys,
		allSchemaCandidateFeatures,
		invoiceCredit: Boolean(config?.invoice_credit),
		setInvoiceCredit: (invoiceCredit: boolean) =>
			form.setFieldValue("config", {
				...config,
				invoice_credit: invoiceCredit,
			}),
		setSchemaItem,
		addSchemaItem,
		removeSchemaItem,
	};
}
