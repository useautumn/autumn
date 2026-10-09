import type { LineItemContext } from "../../../../models/billingModels/lineItem/lineItemContext";

export const descriptionWithEntityLabel = ({
	description,
	context,
}: {
	description: string;
	context: LineItemContext;
}): string => {
	const entityLabel = context.entity?.name || context.entity?.id;
	return entityLabel ? `${description} (${entityLabel})` : description;
};
