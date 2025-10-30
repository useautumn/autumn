import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
	AffectedResource,
	VersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import { z } from "zod/v4";

/**
 * V0_2_InvoicesAlwaysExpanded: Side effect for legacy invoice expansion
 *
 * Applied when: targetVersion <= V0_2
 *
 * Before V1_1, invoices were always included in customer responses.
 * After V1_1, invoices require an explicit expand parameter.
 *
 * This change has side effects and doesn't transform data.
 * The handler must add expand=invoices for requests targeting V0_2 or older.
 */

// Schema is just any since this is a side-effect only change
const NoOpSchema = z.any();

export class V0_2_InvoicesAlwaysExpanded extends VersionChange<
	typeof NoOpSchema,
	typeof NoOpSchema
> {
	readonly name = "V0_2_InvoicesAlwaysExpanded";
	readonly newVersion = ApiVersion.V1_1; // Breaking change introduced in V1_1
	readonly oldVersion = ApiVersion.V0_2; // Applied when targetVersion <= V0_2
	readonly description =
		"Invoices always expanded before V1_1 (requires expand parameter in handler)";
	readonly affectedResources = [AffectedResource.Customer];
	readonly hasSideEffects = true;

	readonly newSchema = NoOpSchema;
	readonly oldSchema = NoOpSchema;

	// No transformation needed - this is a side effect handled in the handler
	transformResponse({
		input,
	}: {
		input: z.infer<typeof NoOpSchema>;
	}): z.infer<typeof NoOpSchema> {
		return input;
	}
}
