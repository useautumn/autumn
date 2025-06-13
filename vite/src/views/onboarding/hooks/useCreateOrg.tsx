import {
  authClient,
  useListOrganizations,
  useSession,
} from "@/lib/auth-client";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEffect, useRef } from "react";

export const useCreateOrg = ({
  productMutate,
}: {
  productMutate: () => Promise<void>;
}) => {
  const axiosInstance = useAxiosInstance();
  const hasCreatedOrg = useRef(false);

  const { data: session } = useSession();
  const { data: organizations, isPending } = useListOrganizations();

  useEffect(() => {
    const createDefaultOrg = async () => {
      if (hasCreatedOrg.current || isPending) return;
      hasCreatedOrg.current = true;
      // Either set first org active, or create a new org
      try {
        if (organizations && organizations.length > 0) {
          await authClient.organization.setActive({
            organizationId: organizations[0]?.id,
          });
        } else {
          await authClient.organization.create({
            name: `${session?.user.name}'s Org`,
            slug: crypto.randomUUID(),
          });

          await productMutate();
        }
        // await axiosInstance.post("/organization");
        // await authClient.use
        // if (
        //   user?.organizationMemberships?.length &&
        //   user.organizationMemberships.length > 0
        // ) {
        //   await setActive?.({
        //     organization: user.organizationMemberships[0].organization.id,
        //   });

        //   return;
        // } else {
        //   const { data } = await axiosInstance.post("/organization");
        //   const res = await setActive?.({ organization: data.id });
        //   await productMutate();
        // }
      } catch (error) {
        console.error("Error creating organization:", error);
      }
    };
    createDefaultOrg();

    // if (!org && setActive) {
    //   createDefaultOrg();
    // }
  }, [session, axiosInstance, productMutate]);
};
