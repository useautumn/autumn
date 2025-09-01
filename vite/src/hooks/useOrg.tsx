import type { FrontendOrg } from "@autumn/shared";
import { useAxiosSWR } from "@/services/useAxiosSwr";

export const useOrg = () => {
	const { data, isLoading, error, mutate } = useAxiosSWR({
		url: "/organization",
	});

	// const { data: orgList } = useListOrganizations();

	// useEffect(() => {
	//   if (!data && orgList?.length === 1) {
	//     authClient.organization.setActive({
	//       organizationId: orgList[0].id,
	//     });

	//     mutate();
	//   }
	// }, [data, orgList]);

	return { org: data as FrontendOrg, isLoading, error, mutate };
};
