"use client";
import { Button } from "@/components/ui/button";
import { PricingCard, PricingTable, Product } from "./pricing-table";

export const products: Product[] = [
  {
    id: "hobby",
    name: "Hobby",
    description: "For personal projects and small-scale applications.",
    price: { primaryText: "Free", secondaryText: "up to 3 users" },
    buttonText: "Start deploying",
    items: [
      {
        primaryText: "Deploy full-stack apps in minutes",
      },
      {
        primaryText: "Fully-managed datastores",
      },
      {
        primaryText: "Custom domains",
      },
      {
        primaryText: "Global CDN & regional hosting",
      },
      {
        primaryText: "Get security out of the box",
      },
      {
        primaryText: "Email support",
      },
    ],
  },
  {
    id: "professional",
    name: "Professional",
    description: "For teams building production applications.",
    recommendedText: "Best Value",
    price: {
      primaryText: "$19",
      secondaryText: "per user/month plus compute costs*",
    },
    priceAnnual: {
      primaryText: "$190",
      secondaryText: "per user/year plus compute costs*",
    },
    buttonText: "Select plan",
    everythingFrom: "Hobby",
    items: [
      {
        primaryText: "10 team members included",
        secondaryText: "Then $20 per member",
      },
      {
        primaryText: "500 GB of bandwidth included",
      },
      {
        primaryText: "Unlimited projects & environments",
      },
      {
        primaryText: "Horizontal autoscaling",
      },
      {
        primaryText: "Test with preview environments",
      },
      {
        primaryText: "Isolated environments",
      },
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    description: "For mission critical applications with complex needs.",
    price: { primaryText: "Custom" },
    buttonText: "Get in touch",
    everythingFrom: "Organization",
    items: [
      {
        primaryText: "Centralized team management",
      },
      {
        primaryText: "Guest users",
      },
      {
        primaryText: "SAML SSO & SCIM",
      },
      {
        primaryText: "Guaranteed uptime",
      },
      {
        primaryText: "Premium support",
      },
      {
        primaryText: "Customer success",
      },
    ],
  },
];

export const PricingTableExample = () => {
  return (
    <div>
      <Button
        onClick={() => document.documentElement.classList.toggle("dark")}
        className="p-2 mb-4 rounded-lg text-zinc-600 dark:text-zinc-300 
        bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
      >
        Toggle theme
      </Button>
      <PricingTable products={products} showFeatures={true}>
        <PricingCard productId="hobby" />
        <PricingCard productId="professional" />
        <PricingCard productId="enterprise" />
      </PricingTable>
    </div>
  );
};
