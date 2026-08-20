import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { OperationScope } from "../../scope/operationScope.js";
import {
	type RepointedCustomerProductRow,
	repointCustomerProductRows,
} from "./repointCustomerProductRows.js";

export const repointCustomerProductsForPage = ({
	db,
	internalCustomerIds,
	scope,
	toInternalProductId,
}: {
	db: DrizzleCli;
	internalCustomerIds: string[];
	scope: OperationScope;
	toInternalProductId: string;
}): Promise<RepointedCustomerProductRow[]> =>
	repointCustomerProductRows({
		db,
		internalCustomerIds,
		scope,
		toInternalProductId,
	});
