import { useOrg } from "@/hooks/common/useOrg";

export const useCustomerDisplayCurrency = ({
	customer,
}: {
	customer: { currency?: string | null } | null | undefined;
}): { displayCurrency: string; orgDefaultCurrency: string } => {
	const { org } = useOrg();
	const orgDefaultCurrency = org?.default_currency ?? "USD";
	const displayCurrency = customer?.currency ?? orgDefaultCurrency;
	return { displayCurrency, orgDefaultCurrency };
};
