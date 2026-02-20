import {
	CreateEntityParamsV1Schema,
	DeleteEntityParamsV0Schema,
	GetEntityParamsV0Schema,
} from "@autumn/shared";
import { createJSDocDescription, example } from "../../utils/jsDocs/index.js";

export const createEntityJsDoc = createJSDocDescription({
	description:
		"Creates an entity for a customer and feature, then returns the entity with balances and subscriptions.",
	whenToUse:
		"Use entities when usage and access must be scoped to sub-resources (for example seats, projects, or workspaces) instead of only the customer.",
	body: CreateEntityParamsV1Schema,
	examples: [
		example({
			description: "Create a seat entity",
			values: {
				customerId: "cus_123",
				entityId: "seat_42",
				featureId: "seats",
				name: "Seat 42",
			},
		}),
	],
	methodName: "entities.create",
	returns:
		"The created entity object including its current subscriptions, purchases, and balances.",
});

export const getEntityJsDoc = createJSDocDescription({
	description: "Fetches an entity by its ID.",
	whenToUse:
		"Use this to read one entity's current state. Pass customerId when you want to scope the lookup to a specific customer.",
	body: GetEntityParamsV0Schema,
	examples: [
		example({
			description: "Fetch a seat entity",
			values: {
				entityId: "seat_42",
			},
		}),
		example({
			description: "Fetch a seat entity for a specific customer",
			values: {
				customerId: "cus_123",
				entityId: "seat_42",
			},
		}),
	],
	methodName: "entities.get",
	returns:
		"The entity object including its current subscriptions, purchases, and balances.",
});

export const deleteEntityJsDoc = createJSDocDescription({
	description: "Deletes an entity by entity ID.",
	whenToUse:
		"Use this when the underlying resource is removed and you no longer want entity-scoped balances or subscriptions tracked for it.",
	body: DeleteEntityParamsV0Schema,
	examples: [
		example({
			description: "Delete a seat entity",
			values: {
				entityId: "seat_42",
			},
		}),
	],
	methodName: "entities.delete",
	returns: "A success flag indicating the entity was deleted.",
});
