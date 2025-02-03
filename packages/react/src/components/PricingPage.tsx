"use client";

import { useAutumnContext } from "../providers/AutumnContext";
import { useCustomSwr } from "../hooks/useCustomSwr";

// use react swr

export const PricingPage = () => {
  const { publishableKey } = useAutumnContext();

  const { data, error, isLoading } = useCustomSwr({
    url: "http://localhost:8080/public/products",
  });

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div className="bg-blue-500 p-4 rounded">
      {data.map((product: any) => (
        <div key={product.id}>{product.name}</div>
      ))}
    </div>
  );
};
