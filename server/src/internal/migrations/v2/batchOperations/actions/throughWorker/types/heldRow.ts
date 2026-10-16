import type { CusProductStatus } from "@autumn/shared";

export type HeldRow = {
	internalCustomerId: string;
	ownerInternalEntityId: string | null;
	ownerEntityId: string | null;
	status: CusProductStatus;
	productLoadedByWorker: boolean;
	internalProductId: string;
	productIsCustom: boolean;
	customerPriceIds: string[];
};
