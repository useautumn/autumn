import { ApiVersion } from "@api/versionUtils/ApiVersion";
import {
	AffectedResource,
	VersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange";
import { z } from "zod/v4";

/**
 * V2_3_CustomerEntityData: Side effect for entity-level data on the Customer object
 *
 * Applied when: targetVersion <= V2_3
 *
 * Before V2_4, a customer-level read returned an aggregated view of the
 * subscriptions and balances attached to that customer's entities. From V2_4
 * the Customer object only reports what is attached to the customer itself;
 * entity-level data is read through the entities endpoints.
 *
 * Side-effect only: the field set is unchanged, so there is nothing to
 * transform. The response builders drop the entity-level rows when this change
 * is not active. Entity-scoped reads (entity_id in the request) are unaffected.
 */

const NoOpSchema = z.any();

export class V2_3_CustomerEntityData extends VersionChange<
	typeof NoOpSchema,
	typeof NoOpSchema
> {
	readonly name = "V2_3_CustomerEntityData";
	readonly newVersion = ApiVersion.V2_4;
	readonly oldVersion = ApiVersion.V2_3;
	readonly description =
		"Customer object aggregated entity-level subscriptions and balances before V2_4";
	readonly affectedResources = [AffectedResource.Customer];
	readonly hasSideEffects = true;

	readonly newSchema = NoOpSchema;
	readonly oldSchema = NoOpSchema;

	transformResponse({
		input,
	}: {
		input: z.infer<typeof NoOpSchema>;
	}): z.infer<typeof NoOpSchema> {
		return input;
	}
}
