import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { backfillProductVersionIdentityInTree } from "@/internal/products/productUtils/backfillProductVersionIdentity.js";

export const attachParamsFromMetadataData = ({
	data,
}: {
	data: unknown;
}): AttachParams => {
	backfillProductVersionIdentityInTree({ value: data });
	return data as AttachParams;
};
