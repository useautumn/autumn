"use client";

import { useRouter } from "next/navigation";

export default function RefreshHandler({ refresh }: { refresh: boolean }) {
  const router = useRouter();
  if (refresh) {
    router.refresh();
  }

  return <></>;
}
