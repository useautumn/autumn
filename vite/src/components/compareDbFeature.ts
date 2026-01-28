import {
	type CreateFeature,
	type CreditSchemaItem,
	type Feature,
	FeatureType,
} from "@autumn/shared";

const creditSchemasSame = ({
	schema1,
	schema2,
}: {
	schema1: CreditSchemaItem[];
	schema2: CreditSchemaItem[];
}) => {
	schema1.sort((a, b) =>
		a.metered_feature_id.localeCompare(b.metered_feature_id),
	);
	schema2.sort((a, b) =>
		a.metered_feature_id.localeCompare(b.metered_feature_id),
	);

	return schema1.every(
		(schema, index) =>
			schema.metered_feature_id === schema2[index].metered_feature_id &&
			schema.credit_amount === schema2[index].credit_amount,
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
