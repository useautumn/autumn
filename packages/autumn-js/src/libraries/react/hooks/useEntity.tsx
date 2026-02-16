import type { EntityGetParams } from "../client/autumnTypes";
import { AutumnContext } from "../AutumnContext";
import { useEntityBase } from "./useEntityBase";

export const useEntity = (
	entityId: string | null,
	params?: EntityGetParams,
) => {
	return useEntityBase({ AutumnContext, entityId, params });
};
