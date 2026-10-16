"use client";

import dynamic from "next/dynamic";

const AtomPlayground = dynamic(() => import("./AtomPlayground"), { ssr: false });

export default function AtomPage() {
  return <AtomPlayground />;
}
