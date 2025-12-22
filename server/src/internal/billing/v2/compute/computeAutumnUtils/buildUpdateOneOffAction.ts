import type { FullCusProduct } from "@autumn/shared";
import type { AutumnContext } from "../../../../../honoUtils/HonoEnv";
import type { AttachContext } from "../../typesOld";

export const buildUpdateOneOffAction = ({
	ctx,
	attachContext,
	newCusProducts,
}: {
	ctx: AutumnContext;
	attachContext: AttachContext;
	newCusProducts: FullCusProduct[];
}) => {
	return {
		targetCusProduct: newCusProducts[0],
	};
};
