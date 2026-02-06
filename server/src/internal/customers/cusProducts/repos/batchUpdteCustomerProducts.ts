import type { InsertCustomerProduct } from "@shared/models/cusProductModels/cusProductTable";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

export const batchUpdateCustomerProducts = async ({
	ctx,
	updates,
}: {
	ctx: AutumnContext;
	updates: {
		id: string;
		updates: Partial<InsertCustomerProduct>;
	}[];
}) => {
	const { db } = ctx;
};
