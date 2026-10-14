import { useCustomer } from "autumn-js/react";
import { useEffect } from "react";
import { useLocalStorage } from "@/hooks/common/useLocalStorage";
import { notNullish } from "@/utils/genUtils";

export const useAutumnFlags = () => {
	const { data: customer, isPending } = useCustomer();
	const isProdApp = window.location.hostname === "app.useautumn.com";

	const [flags, setFlags] = useLocalStorage("autumn.flags", {
		stripe_key: false,
		platform: false,
		vercel: false,
		revenuecat: false,
		sso: false,
		atoms: false,
	});

	useEffect(() => {
		if (!customer?.flags) return;

		const nextFlags = {
			stripe_key: notNullish(customer.flags.stripe_key),
			platform: notNullish(customer.flags.platform),
			vercel: notNullish(customer.flags.vercel),
			revenuecat: notNullish(customer.flags.revenuecat),
			sso: notNullish(customer.flags.sso),
			atoms: (customer.balances?.atoms?.remaining ?? 0) > 0,
		};

		if (
			flags.stripe_key !== nextFlags.stripe_key ||
			flags.platform !== nextFlags.platform ||
			flags.vercel !== nextFlags.vercel ||
			flags.revenuecat !== nextFlags.revenuecat ||
			flags.sso !== nextFlags.sso ||
			flags.atoms !== nextFlags.atoms
		) {
			setFlags(nextFlags);
		}
	}, [customer?.flags]);

	return {
		...flags,
		atoms: flags.atoms || !isProdApp,
		webhooks: true as const,
		isLoading: isPending,
	};
};
