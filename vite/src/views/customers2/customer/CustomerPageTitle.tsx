import type { FullCustomer } from "@autumn/shared";
import { useEffect } from "react";

type CustomerTitle = Pick<FullCustomer, "name" | "email" | "id">;

export const getCustomerPageTitle = ({ name, email, id }: CustomerTitle) =>
	`${name || email || id || "Customer"} – Autumn`;

export const CustomerPageTitle = ({
	customer,
}: {
	customer: CustomerTitle | null | undefined;
}) => {
	const title = customer ? getCustomerPageTitle(customer) : null;

	useEffect(() => {
		if (!title) return;

		const previousTitle = document.title;
		document.title = title;
		return () => {
			document.title = previousTitle;
		};
	}, [title]);

	return null;
};
