import type { CreditSchemaItem, Feature } from "@autumn/shared";
import { FeatureType, isAiCreditSystem } from "@autumn/shared";
import { useMemo, useRef, useState } from "react";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import {
	expandedKeyAfterItemChange,
	keysForSchema,
	removeSchemaItemAt,
} from "../utils/creditSchemaList";
import { createSchemaItem } from "../utils/creditSchemaUtils";

export function useCreditSchemaList({
	schema,
	onChange,
	onRemoveLast,
}: {
	schema: CreditSchemaItem[];
	onChange: (schema: CreditSchemaItem[]) => void;
	onRemoveLast?: () => void;
}) {
	const { features } = useFeaturesQuery();
	const [expandedKey, setExpandedKey] = useState<string | null>(null);

	const schemaKeysRef = useRef<string[]>([]);
	const schemaKeys = useMemo(() => {
		const nextKeys = keysForSchema({
			keys: schemaKeysRef.current,
			length: schema.length,
		});
		schemaKeysRef.current = nextKeys;
		return nextKeys;
	}, [schema.length]);

	const allSchemaCandidateFeatures = features.filter(
		(f: Feature) => f.type === FeatureType.Metered || isAiCreditSystem(f.type),
	);

	const availableFeaturesFor = (item: CreditSchemaItem) =>
		allSchemaCandidateFeatures.filter(
			(feature: Feature) =>
				!schema.some(
					(schemaItem: CreditSchemaItem) =>
						feature.id !== item.metered_feature_id &&
						schemaItem.metered_feature_id === feature.id,
				),
		);

	const toggleExpandedKey = (key: string) =>
		setExpandedKey((current) => (current === key ? null : key));

	const setSchemaItem = ({
		index,
		item,
	}: {
		index: number;
		item: CreditSchemaItem;
	}) => {
		setExpandedKey((current) =>
			expandedKeyAfterItemChange({
				previous: schema[index],
				next: item,
				rowKey: schemaKeys[index],
				current,
			}),
		);
		onChange(schema.map((existing, i) => (i === index ? item : existing)));
	};

	const addSchemaItem = () => {
		const key = crypto.randomUUID();
		schemaKeysRef.current = [...schemaKeysRef.current, key];
		onChange([...schema, createSchemaItem()]);
		setExpandedKey(key);
	};

	const removeSchemaItem = (index: number) => {
		if (schema.length === 1 && onRemoveLast) {
			onRemoveLast();
			return;
		}
		const next = removeSchemaItemAt({
			schema,
			keys: schemaKeysRef.current,
			index,
		});
		schemaKeysRef.current = next.keys;
		onChange(next.schema);
	};

	return {
		schemaKeys,
		allSchemaCandidateFeatures,
		availableFeaturesFor,
		expandedKey,
		toggleExpandedKey,
		setSchemaItem,
		addSchemaItem,
		removeSchemaItem,
	};
}
