import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import type { z } from "zod/v4";
import {
	AttachResponseV0Schema,
	AttachResponseV1Schema,
} from "../prevVersions/attachResponseV1.js";

export const V0_2_AttachChange = defineVersionChange({
	name: "V0.2 Attach Change",
	newVersion: ApiVersion.V1_1,
	oldVersion: ApiVersion.V0_2,
	description: [
		"Attach response transformed to minimal V0.2 format",
		"Removes customer_id, product_ids, code, message, and invoice fields",
		"Retains only success and checkout_url",
	],
	affectedResources: [AffectedResource.Attach],
	newSchema: AttachResponseV1Schema,
	oldSchema: AttachResponseV0Schema,
	affectsResponse: true,

	transformResponse: ({
		input,
	}: {
		input: z.infer<typeof AttachResponseV1Schema>;
	}): z.infer<typeof AttachResponseV0Schema> => {
		if (input.checkout_url) {
			return {
				checkout_url: input.checkout_url,
			};
		}

		return {
			success: input.success,
			message: input.message,
			checkout_url: input.checkout_url,
			invoice: input.invoice ?? undefined,
		};
	},
});
