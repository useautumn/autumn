import {
	type CreateFeature,
	type CreditSchemaItem,
	type Feature,
	FeatureType,
} from "@autumn/shared";
import { creditSchemaToApi } from "@/views/products/features/credit-systems/utils/creditSchemaUtils";

const byMeteredFeatureId = (a: CreditSchemaItem, b: CreditSchemaItem) =>
	a.metered_feature_id.localeCompare(b.metered_feature_id);

/** Compares the serialized rate card so billing units, rate type, and tiers all
 * count as changes. */
const creditSchemasSame = ({
	schema1,
	schema2,
}: {
	schema1: CreditSchemaItem[];
	schema2: CreditSchemaItem[];
}) => {
	if (schema1.length !== schema2.length) return false;

	return (
		JSON.stringify(creditSchemaToApi([...schema1].sort(byMeteredFeatureId))) ===
		JSON.stringify(creditSchemaToApi([...schema2].sort(byMeteredFeatureId)))
	);
};

const eventNamesSame = ({
	eventNames1,
	eventNames2,
}: {
	eventNames1: string[];
	eventNames2: string[];
}) => {
	eventNames1.sort();
	eventNames2.sort();

	return eventNames1.every(
		(eventName, index) => eventName === eventNames2[index],
	);
};

export const compareDbFeature = ({
	curFeature,
	newFeature,
}: {
	curFeature?: Feature | CreateFeature;
	newFeature?: Feature | CreateFeature;
}) => {
	if (!curFeature && !newFeature) {
		return true;
	}

	if (!curFeature || !newFeature) {
		return false;
	}

	const diffs = {
		id: {
			condition: curFeature.id !== newFeature.id,
			message: `ID different: ${curFeature.id} !== ${newFeature.id}`,
		},
		name: {
			condition: curFeature.name !== newFeature.name,
			message: `Name different: ${curFeature.name} !== ${newFeature.name}`,
		},
		type: {
			condition: curFeature.type !== newFeature.type,
			message: `Type different: ${curFeature.type} !== ${newFeature.type}`,
		},

		usage_type: {
			condition:
				curFeature.type === FeatureType.Metered &&
				newFeature.type === FeatureType.Metered &&
				curFeature.config?.usage_type !== newFeature.config?.usage_type,
			message: `Usage type different: ${curFeature.config?.usage_type} !== ${newFeature.config?.usage_type}`,
		},

		credit_schema: {
			condition:
				curFeature.type === FeatureType.CreditSystem &&
				newFeature.type === FeatureType.CreditSystem &&
				!creditSchemasSame({
					schema1: curFeature.config?.schema || [],
					schema2: newFeature.config?.schema || [],
				}),
			message: `Credit schema different: ${curFeature.config?.schema} !== ${newFeature.config?.schema}`,
		},

		invoice_credit: {
			condition:
				curFeature.type === FeatureType.CreditSystem &&
				newFeature.type === FeatureType.CreditSystem &&
				Boolean(curFeature.config?.invoice_credit) !==
					Boolean(newFeature.config?.invoice_credit),
			message: `Invoice credit different: ${curFeature.config?.invoice_credit} !== ${newFeature.config?.invoice_credit}`,
		},

		event_names: {
			condition:
				curFeature.type === FeatureType.Metered &&
				newFeature.type === FeatureType.Metered &&
				!eventNamesSame({
					eventNames1: curFeature.event_names || [],
					eventNames2: newFeature.event_names || [],
				}),
			message: `Event names different: ${curFeature.event_names} !== ${newFeature.event_names}`,
		},

		stripe_product_id: {
			condition:
				(curFeature.stripe_product_id || null) !==
				(newFeature.stripe_product_id || null),
			message: `Stripe product different: ${curFeature.stripe_product_id} !== ${newFeature.stripe_product_id}`,
		},
	};

	const same = Object.values(diffs).every((d) => !d.condition);

	if (!same) {
		console.log(
			"feature differences:",
			Object.values(diffs)
				.filter((d) => d.condition)
				.map((d) => d.message),
		);
	}

	return same;
};
