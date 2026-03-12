import { getFreeDefaultProductByGroup } from "@/internal/products/actions/getFreeDefaultProductByGroup";
import { updateVariant } from "@/internal/products/actions/updateVariant";

export const productActions = {
	getFreeDefaultByGroup: getFreeDefaultProductByGroup,
	updateVariant,
};
