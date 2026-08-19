import type { FullCustomer } from "@autumn/shared";

export type CustomerTitle = Pick<FullCustomer, "name" | "email" | "id">;

export const getCustomerPageTitle = ({ name, email, id }: CustomerTitle) =>
	`${name || email || id || "Customer"} – Autumn`;
