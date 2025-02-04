"use client";
import React from 'react';
import { useAutumnContext } from "../providers/AutumnContext";
import { useCustomSwr } from "../hooks/useCustomSwr";
import { cn } from "../../lib/utils";

// use react swr

interface PricingPageProps {
  className?: string;
}

export default function PricingPage({ className }: PricingPageProps) {

  const { data, error, isLoading } = useCustomSwr({
    url: "https://api.useautumn.com/v1/public/products",
  });

  // if (isLoading) return <div>Loading...</div>;
  // if (error) return <div>Error: {error.message}</div>;

  console.log(data);

  return (
    <div 
    className={cn(
      "border rounded-md p-4 bg-fuchsia-500",
      className
    )}
    // className="border rounded p-4 bg-rose-400 border-blue-300"
    >
      {/* {data?.map((product: any) => (
        <div key={product.id}>{product.name}</div>
      ))} */}
    </div>
  );
}
