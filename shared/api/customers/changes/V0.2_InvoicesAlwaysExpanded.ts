import { ApiVersion } from "@api/versionUtils/ApiVersion";
import {
	AffectedResource,
	VersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange";
import { z } from "zod/v4";

const NoOpSchema = z.any();

export class V0_2_InvoicesAlwaysExpanded extends VersionChange<
	typeof NoOpSchema,
	typeof NoOpSchema
> {
	readonly name = "V0_2_InvoicesAlwaysExpanded";
	readonly newVersion = ApiVersion.V1_1;
	readonly oldVersion = ApiVersion.V0_2;
	readonly description =
		"Invoices always expanded before V1_1 (requires expand parameter in handler)";
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
