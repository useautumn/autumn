import { useEffect } from "react";
import {
	type CustomerTitle,
	getCustomerPageTitle,
} from "./getCustomerPageTitle";

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
