import { useSession } from "@/lib/auth-client";
import { notNullish } from "@/utils/genUtils";
import { useEffect, useState } from "react";

export const useAdmin = () => {
  const { data, isPending } = useSession();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (
      data?.user?.role === "admin" ||
      notNullish(data?.session.impersonatedBy)
    ) {
      setIsAdmin(true);
    }
  }, [data]);

  return { isAdmin, isPending };
};
