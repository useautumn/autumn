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

/**
 * V0_2_AttachChange: Transforms attach response TO V0.2 format
 *
 * Applied when: targetVersion <= V0_2
 *
 * Breaking changes introduced in V1.1 (that we reverse here):
 *
 * 1. Structure: V1.1+ includes additional response fields
 *    - V1.1+: { success, customer_id, product_ids, code, message, checkout_url?, invoice? }
 *    - V0.2: { success, checkout_url? }
 *
 * 2. The V0.2 format only returns success status and optional checkout_url
 * 3. The V1.1+ format includes customer_id, product_ids, code, message, and invoice fields
 *
 * Input: AttachResponseV1 (V1.1+ format)
 * Output: AttachResponseV0 (V0.2 minimal format)
 */

export const V0_2_AttachChange = defineVersionChange({
	name: "V0.2 Attach Change",
	newVersion: ApiVersion.V1_1, // Breaking change introduced in V1_1
	oldVersion: ApiVersion.V0_2, // Applied when targetVersion <= V0_2
	description: [
		"Attach response transformed to minimal V0.2 format",
		"Removes customer_id, product_ids, code, message, and invoice fields",
		"Retains only success and checkout_url",
	],
	affectedResources: [AffectedResource.Attach],
	newSchema: AttachResponseV1Schema,
	oldSchema: AttachResponseV0Schema,
	affectsResponse: true,

	// Response: V1.1+ (AttachResponseV1) → V0.2 (AttachResponseV0)
	transformResponse: ({
		input,
	}: {
		input: z.infer<typeof AttachResponseV1Schema>;
	}): z.infer<typeof AttachResponseV0Schema> => {
		return {
			success: input.success,
			checkout_url: input.checkout_url,
			invoice: input.invoice ?? undefined,
		};
	},
});
