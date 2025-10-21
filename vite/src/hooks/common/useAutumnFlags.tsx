import { useCustomer } from "autumn-js/react";
import { useEffect } from "react";
import { useLocalStorage } from "@/hooks/common/useLocalStorage";
import { notNullish } from "@/utils/genUtils";

export const useAutumnFlags = () => {
	const { customer } = useCustomer();

	const [flags, setFlags] = useLocalStorage("autumn.flags", {
		pkey: false,
		webhooks: false,
		stripe_key: false,
		platform: false,
	});

	useEffect(() => {
		if (!customer?.features) return;

		const nextFlags = {
			pkey: notNullish(customer.features.pkey),
			webhooks: notNullish(customer.features.webhooks),
			stripe_key: notNullish(customer.features.stripe_key),
			platform: notNullish(customer.features.platform),
		};

		// Only update storage/state when values actually change
		if (
			flags.pkey !== nextFlags.pkey ||
			flags.webhooks !== nextFlags.webhooks ||
			flags.stripe_key !== nextFlags.stripe_key ||
			flags.platform !== nextFlags.platform
		) {
			setFlags(nextFlags);
		}
	}, [customer?.features]);

	return flags;
};
