import {
	type CreatePlanItemParamsV1Input,
	CreatePlanItemParamsV1Schema,
} from "@autumn/shared/api/products/items/crud/createPlanItemParamsV1.js";
import { hashJson } from "@/utils/hash/hashJson.js";

export const hashPlanItemArtifact = ({
	item,
}: {
	item: CreatePlanItemParamsV1Input;
}) =>
	hashJson({
		value: CreatePlanItemParamsV1Schema.parse(item),
	});
