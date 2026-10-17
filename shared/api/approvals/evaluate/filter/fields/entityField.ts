import type { EntityFacts } from "../../facts/billingFacts";
import { nullableObjectField } from "./nullableObjectField";
import { stringField } from "./stringField";

type Entity = NonNullable<EntityFacts>;

/** `null` = the change is at the customer level; otherwise the entity's type. */
export const entityField = <Parent>({
	labels,
	read,
}: {
	labels: { entity: string; "entity.feature_id": string };
	read: (parent: Parent) => EntityFacts;
}) =>
	nullableObjectField<Parent, Entity>({
		label: labels.entity,
		read,
		fields: {
			feature_id: stringField({
				label: labels["entity.feature_id"],
				read: (entity) => entity.feature_id,
			}),
		},
		describeValue: (entity) => entity.feature_id,
	});
