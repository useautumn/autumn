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

/**
 * Controlled credit-schema array mechanics shared by the feature-level editor
 * (TanStack-form backed) and the plan-item feature_override editor (item
 * config backed): stable row keys, candidate features, the expanded accordion
 * row, and add/remove/update against whatever store the caller writes to.
 */
export function useCreditSchemaList({
	schema,
	onChange,
	onRemoveLast,
}: {
	schema: CreditSchemaItem[];
	onChange: (schema: CreditSchemaItem[]) => void;
	/** Called instead of onChange when removing the only remaining item. */
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
