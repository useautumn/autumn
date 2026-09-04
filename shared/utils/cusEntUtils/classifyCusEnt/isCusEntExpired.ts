import type { FullCustomerEntitlement } from "../../../models/cusProductModels/cusEntModels/cusEntModels.js";

export const isCusEntExpired = ({
	cusEnt,
	now = Date.now(),
}: {
	cusEnt: Pick<FullCustomerEntitlement, "expires_at">;
	now?: number;
}) => cusEnt.expires_at != null && cusEnt.expires_at <= now;
