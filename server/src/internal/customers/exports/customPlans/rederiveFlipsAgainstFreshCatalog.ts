import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { deriveStoredCustomerProductIsCustom } from "@/internal/customers/cusProducts/actions/deriveIsCustom/deriveStoredCustomerProductIsCustom.js";
import {
	type DerivedCustomerProduct,
	isApplicableFlip,
} from "./applyIsCustomFlips.js";

export const rederiveFlipsAgainstFreshCatalog = ({
	ctx,
	derived,
}: {
	ctx: AutumnContext;
	derived: DerivedCustomerProduct[];
}): Promise<DerivedCustomerProduct[]> =>
	Promise.all(
		derived.map(async (entry) => {
			if (!isApplicableFlip(entry)) return entry;
			return {
				customerProduct: entry.customerProduct,
				result: await deriveStoredCustomerProductIsCustom({
					ctx,
					customerProduct: entry.customerProduct,
					baseProducts: new Map(),
				}),
			};
		}),
	);
