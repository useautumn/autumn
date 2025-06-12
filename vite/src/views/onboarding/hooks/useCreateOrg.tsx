import { useSession } from "@/lib/auth-client";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEffect, useRef, useState } from "react";

export const useCreateOrg = ({
  productMutate,
}: {
  productMutate: () => Promise<void>;
}) => {
  const axiosInstance = useAxiosInstance();
  const hasCreatedOrg = useRef(false);

  const { data: session } = useSession();
  // const { user } = useUser();
  // const { organization: org } = useOrganization();
  // const { setActive } = useOrganizationList();

  useEffect(() => {
    console.log("session", session);
    const createDefaultOrg = async () => {
      if (hasCreatedOrg.current) return;
      hasCreatedOrg.current = true;
      // Either set first org active, or create a new org
      try {
        await axiosInstance.post("/organization");
        // if (
        //   user?.organizationMemberships?.length &&
        //   user.organizationMemberships.length > 0
        // ) {
        //   await setActive?.({
        //     organization: user.organizationMemberships[0].organization.id,
        //   });
        //   await productMutate();
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
