import { useAxiosSWR } from "@/services/useAxiosSwr";
import LoadingScreen from "../general/LoadingScreen";
import { ModelPricing } from "./model-pricing/ModelPricing";
import { useListProducts } from "./model-pricing/usePricingTable";
import { parseAsBoolean, parseAsString, useQueryStates } from "nuqs";
import IntegrateAutumn from "./integrate/IntegrateAutumn";
import { useEffect, useRef, useState } from "react";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useSearchParams } from "react-router";
import { useSession } from "@/lib/auth-client";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useOnboardingQueryState } from "./hooks/useOnboardingQueryState";
import { useOrg } from "@/hooks/common/useOrg";

export default function OnboardingView2() {
	// const [queryStates, setQueryStates] = useQueryStates(
	//   {
	//     page: parseAsString.withDefault("pricing"),
	//     reactTypescript: parseAsBoolean.withDefault(true),
	//     frontend: parseAsString.withDefault(""),
	//     backend: parseAsString.withDefault(""),
	//     auth: parseAsString.withDefault(""),
	//     customerType: parseAsString.withDefault("user"),
	//     productId: parseAsString.withDefault(""),
	//     token: parseAsString.withDefault(""),
	//   },
	//   {
	//     history: "push",
	//   }
	// );

	const { queryStates, setQueryStates } = useOnboardingQueryState();

	const [loading, setLoading] = useState(true);
	const axiosInstance = useAxiosInstance();
	const hasHandledToken = useRef(false);
	const { data } = useSession();
	const orgId = data?.session?.activeOrganizationId;

	const {
		products: autumnProducts,
		isLoading: isAutumnLoading,
		mutate: refetchAutumnProducts,
	} = useListProducts({ customerId: "onboarding_demo_user" });

	const { isLoading: productsLoading } = useProductsQuery();
	const { isLoading: orgLoading } = useOrg();

	useEffect(() => {
		const handleToken = async () => {
			try {
				await axiosInstance.post("/onboarding", {
					token: queryStates.token,
				});

				// await productMutate();
				await refetchAutumnProducts();
			} catch (error) {
				console.error(error);
			} finally {
				setLoading(false);
			}
		};

		if (queryStates.token && !hasHandledToken.current) {
			hasHandledToken.current = true;
			handleToken();
		}
	}, [queryStates.token, axiosInstance]);

	useEffect(() => {
		if (orgId && !queryStates.token) {
			setLoading(false);
		}
	}, [orgId, queryStates.token]);

	if (isAutumnLoading || loading || productsLoading || orgLoading)
		return <LoadingScreen />;

	return (
		<>
			{queryStates.page === "integrate" ? (
				<IntegrateAutumn
				// data={productsData}
				// mutate={productMutate}
				// queryStates={queryStates}
				// setQueryStates={setQueryStates}
				/>
			) : (
				<ModelPricing
					// data={productsData}
					// mutate={async () => {
					//   await productMutate();
					//   await mutateAutumnProducts();
					// }}
					// mutateAutumnProducts={mutateAutumnProducts}
					autumnProducts={autumnProducts}
					refetchAutumnProducts={refetchAutumnProducts}
					// productCounts={productCounts}
					// mutateCounts={mutateCounts}
					// queryStates={queryStates}
					// setQueryStates={setQueryStates}
				/>
			)}
		</>
	);
}
