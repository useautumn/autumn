import { CodeDisplay } from "@/components/general/CodeDisplay";
import Step from "@/components/general/OnboardingStep";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

import CodeBlock from "../components/CodeBlock";
import { ArrowUpRightFromSquare } from "lucide-react";
import { Feature, Product } from "@autumn/shared";
import { useState } from "react";
import { FeatureTypeBadge } from "@/views/products/features/components/FeatureTypeBadge";

const checkAccessCode = (
	apiKey: string,
	id: string,
	isProduct: boolean,
) => `// app/page.tsx

import { useCustomer } from "autumn-js/react";

export default function CheckAccess() {
  const { customer, check } = useCustomer();

  const handleCheckAccess = () => {
    const { data } = check({ ${isProduct ? "productId" : "featureId"}: "${id}" });
    
    ${
			isProduct
				? `// Check if customer has an active product
    if (data?.allowed) {
      alert("You have access to ${id}");
    } else {
      alert("You don't have access to ${id}");
    }`
				: `// Check feature balance
    if (data?.allowed) {
      alert("You have access to ${id}. Balance: " + data?.balance);
    } else {
      alert("You don't have access to ${id}");
    }`
		}
  };
  
  return <button onClick={handleCheckAccess}>Check Access</button>;
}
`;

const checkAccessCodeTypescript = (
	apiKey: string,
	id: string,
	isProduct: boolean,
) => `import { Autumn } from "autumn-js";

const autumn = new Autumn({ secretKey: "am_sk_..." });

let { data } = await autumn.check({
  customer_id: "user_123",
  ${isProduct ? "product_id" : "feature_id"}: "${id}",
});

if (!data?.allowed) {
  console.log("User does not have access to ${id}");
}
`;

const usageEventCode = (
	apiKey: string,
	id: string,
	isProduct: boolean,
) => `import { Autumn } from "autumn-js";

const autumn = new Autumn({ secretKey: "am_sk_..." });

autumn.track({
  customer_id: "user_123",
  "feature_id": "${id}",
  "value": 1
});
`;

export default function CheckAccessStep({
	apiKey,
	features,
	number,
	products,
}: {
	apiKey: string;
	features: Feature[];
	number: number;
	products: Product[];
}) {
	const [isProduct, setIsProduct] = useState<boolean>(true);
	const [selectedFeature, setSelectedFeature] = useState<Feature | undefined>(
		features.length > 0 ? features[0] : undefined,
	);
	const [selectedProductId, setSelectedProductId] = useState<string>(
		products.length > 0 ? products[0].id! : "",
	);

	const selectedId = isProduct ? selectedProductId : selectedFeature?.id || "";
	const selectedItems = isProduct ? products : features;

	return (
		<Step
			title="Check a customer's access permissions, and send usage events"
			number={number}
			description={
				<>
					<div className="flex gap-2">
						<button
							onClick={() => setIsProduct(true)}
							className={`px-3 py-1 text-sm rounded-xs ${
								isProduct
									? "bg-blue-500 text-white"
									: "bg-gray-200 text-gray-700 hover:bg-gray-300"
							}`}
						>
							Product
						</button>
						<button
							onClick={() => setIsProduct(false)}
							className={`px-3 py-1 text-sm rounded-xs ${
								!isProduct
									? "bg-blue-500 text-white"
									: "bg-gray-200 text-gray-700 hover:bg-gray-300"
							}`}
						>
							Feature
						</button>
					</div>
					<span>
						Check whether a customer can access a{" "}
						{isProduct ? "plan" : "feature"} by calling the{" "}
						<span className="font-mono text-red-500">
							<a
								href="https://docs.useautumn.com/api-reference/entitled"
								target="_blank"
								rel="noopener noreferrer"
							>
								/check
							</a>
							<ArrowUpRightFromSquare size={12} className="inline ml-1" />
						</span>{" "}
						endpoint.
					</span>
					{!isProduct && selectedFeature?.type === "metered" && (
						<span>
							If it&apos;s a metered (usage-based) feature, send us the usage
							data by calling the{" "}
							<span className="font-mono text-red-500">
								<a
									href="https://docs.useautumn.com/api-reference/events/post"
									target="_blank"
									rel="noopener noreferrer"
								>
									/track
								</a>
								<ArrowUpRightFromSquare size={12} className="inline ml-1" />
							</span>{" "}
							endpoint.
						</span>
					)}
					<div className="flex flex-col gap-2">
						<Select
							value={selectedId}
							onValueChange={
								isProduct
									? setSelectedProductId
									: (value) =>
											setSelectedFeature(features.find((f) => f.id === value))
							}
						>
							<SelectTrigger className="w-full max-w-48">
								{selectedId ? (
									<div className="flex items-center gap-2">
										<span>
											{isProduct
												? products.find((p) => p.id === selectedId)?.name
												: selectedFeature?.name}
										</span>
										{!isProduct && selectedFeature && (
											<FeatureTypeBadge {...selectedFeature} />
										)}
									</div>
								) : (
									<SelectValue
										placeholder={`Select a ${isProduct ? "plan" : "feature"}`}
									/>
								)}
							</SelectTrigger>
							<SelectContent>
								{selectedItems.map((item) => (
									<SelectItem key={item.id} value={item.id!}>
										<div className="flex items-center gap-2">
											<span>{item.name}</span>
										</div>
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</>
			}
		>
			<div className="flex flex-col gap-2">
				<CodeBlock
					snippets={[
						{
							title: "React",
							language: "javascript",
							displayLanguage: "javascript",
							content: checkAccessCode(apiKey, selectedId, isProduct),
						},
						{
							title: "Node.js",
							language: "typescript",
							displayLanguage: "typescript",
							content: checkAccessCodeTypescript(apiKey, selectedId, isProduct),
						},
					]}
				/>
				{isProduct === false && selectedFeature?.type === "metered" && (
					<CodeBlock
						snippets={[
							{
								title: "Node.js",
								language: "javascript",
								displayLanguage: "javascript",
								content: usageEventCode(apiKey, selectedId, isProduct),
							},
						]}
					/>
				)}
			</div>
		</Step>
	);
}
