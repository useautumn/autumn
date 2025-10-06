import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
	AffectedResource,
	VersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import { z } from "zod/v4";

/**
 * V1_1: Invoices expansion behavior changed (side effect only)
 *
 * V1_1+: Invoices require explicit expand parameter
 * V1_0: Invoices always included (side effect - must be handled in handler)
 *
 * This change has side effects and doesn't transform data.
 * The handler must add CusExpand.Invoices for V1_0 requests.
 */

// Schema is just any since this is a side-effect only change
const NoOpSchema = z.any();

export class V1_1_LegacyExpandInvoices extends VersionChange<
	typeof NoOpSchema,
	typeof NoOpSchema
> {
	readonly version = ApiVersion.V1_1;
	readonly description = "Invoices always expanded before V1_1";
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
