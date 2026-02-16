import type * as models from "@useautumn/sdk/models";
import type * as operations from "@useautumn/sdk/models/operations";
import { getEntityExpandStr } from "../../../utils/entityUtils";
import type { EntityCreateParams, EntityGetParams } from "./autumnTypes";
import type { AutumnClient } from "./ReactAutumnClient";

export async function createEntityMethod(
	this: AutumnClient,
	params: EntityCreateParams,
): Promise<models.Entity> {
	const res = await this.post(`${this.prefix}/entities`, params);
	return res;
}

export async function getEntityMethod(
	this: AutumnClient,
	entityId: string,
	params?: EntityGetParams,
): Promise<models.Entity> {
	const expand = getEntityExpandStr(params?.expand as Array<string>);
	const res = await this.get(`${this.prefix}/entities/${entityId}?${expand}`);

	return res;
}

export async function deleteEntityMethod(
	this: AutumnClient,
	entityId: string,
): Promise<operations.DeleteCustomersCustomerIdEntitiesEntityIdResponse> {
	const res = await this.delete(`${this.prefix}/entities/${entityId}`);
	return res;
}
