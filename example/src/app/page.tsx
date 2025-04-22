"use client";

import { useAutumn } from "autumn-js/next";

export default function Home() {
  const { customer, attach } = useAutumn();
  return (
    <div className="h-screen w-full flex flex-col gap-4 items-center justify-center">
      <div className="text-2xl font-bold">{customer?.name}</div>
      <button
        onClick={async () => {
          await attach({
            productId: "pro-example",
          });
        }}
      >
        Upgrade
      </button>
    </div>
  );
}
