import { PaywallDialog, PricingTable, useCustomer } from "autumn-js/react";
import {
	ArrowUpRightFromSquare,
	Check,
	ChevronDown,
	ChevronRight,
	Code,
	Lock,
	Send,
} from "lucide-react";
import { useCallback, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { cn } from "@/lib/utils";
import CodeBlock from "@/views/onboarding/components/CodeBlock";

export const SampleApp = () => {
	const [searchParams] = useSearchParams();
	const [open, setOpen] = useState(false);
	const [checkData, setCheckData] = useState<any>(null);
	const [trackData, setTrackData] = useState<any>(null);
	const [showCodeSection, setShowCodeSection] = useState(true);
	const [showCheckSnippet, setShowCheckSnippet] = useState(true);
	const [showTrackSnippet, setShowTrackSnippet] = useState(true);
	const [showCustomerSnippet, setShowCustomerSnippet] = useState(true);

	const { features, isLoading } = useFeaturesQuery();

	const [lastUsedFeature, setLastUsedFeature] = useState<any>({
		featureId: features?.[0]?.id,
		value: 1,
	});

	const { customer, openBillingPortal } = useCustomer();

	if (isLoading) return null;
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="outline">
					<ArrowUpRightFromSquare size={12} className="mr-2" />
					Show example app
				</Button>
			</DialogTrigger>
			<DialogContent className="!max-w-[90vw] max-h-[90vh] overflow-x-hidden overflow-y-auto w-full h-full flex flex-col">
				<div>
					<DialogHeader className="flex flex-row items-center justify-between h-12">
						<DialogTitle>Sample App</DialogTitle>
						<Button
							variant="outline"
							size="sm"
							onClick={() => {
								setShowCodeSection(!showCodeSection);
							}}
							className="self-start bg-zinc-800 text-white mr-7"
						>
							<Code size={16} className="mr-2" />
							{showCodeSection ? "Hide Code" : "Show Code"}
						</Button>
					</DialogHeader>
					<div className="w-full max-w-4xl">
						<span className="text-sm text-t3">
							Every time you use a feature, we{" "}
							<span className="font-medium font-mono bg-zinc-200 rounded-xs px-1 text-t2">
								check
							</span>{" "}
							for access permission, then{" "}
							<span className="font-medium font-mono bg-zinc-200 rounded-xs px-1 text-t2">
								track
							</span>{" "}
							the usage. Test using features, hitting usage limits, upgrade and
							downgrade flows, and making changes to your products.
						</span>
					</div>
				</div>
				<div className="flex gap-6 ">
					<div className="flex flex-col gap-3 w-full pr-10">
						<div className="flex flex-col gap-2">
							<div className="flex items-center justify-between">
								<h3 className="text-md font-medium">Available Features</h3>
							</div>
							<div className="flex flex-wrap gap-2 items-center">
								{features
									?.filter((feature: any) => customer?.features?.[feature.id])
									.concat(
										features?.filter(
											(feature: any) => !customer?.features?.[feature.id],
										) || [],
									)
									.map((feature: any, index: number) => {
										const customerFeature = customer?.features?.[feature.id];
										return (
											<FeatureUsageItem
												key={index}
												feature={feature}
												customerFeature={customerFeature}
												onCheckData={setCheckData}
												onTrackData={setTrackData}
												onFeatureUsed={setLastUsedFeature}
											/>
										);
									})}
							</div>
						</div>

						{/* Products List */}
						<div className="flex flex-col gap-2">
							<div className="flex items-end justify-between">
								<h3 className="text-md font-medium">Billing</h3>
								{customer?.stripe_id && (
									<Button
										variant="outline"
										onClick={async () => {
											const { error } = await openBillingPortal();
											if (error) {
												toast.error(error.message);
											}
										}}
									>
										Manage Billing
									</Button>
								)}
							</div>

							<div className="flex flex-col gap-2 w-full">
								<PricingTable />
							</div>
						</div>
					</div>

					{/* Code Snippets Toggle Button */}
					{showCodeSection && (
						<div className="flex flex-col gap-3 animate-in slide-in-from-right-1/2 duration-300">
							{/* Code Snippets */}
							<div className="flex flex-col gap-3 w-full max-w-96 min-w-96 ">
								<div className="flex flex-col gap-4">
									<div className="flex flex-col">
										<div className="flex items-center justify-between mb-1">
											<span className="text-sm text-t2">Check feature</span>
											<Button
												variant="ghost"
												size="sm"
												onClick={() => setShowCheckSnippet(!showCheckSnippet)}
												className="h-6 w-6 p-0"
											>
												{showCheckSnippet ? (
													<ChevronDown size={12} />
												) : (
													<ChevronRight size={12} />
												)}
											</Button>
										</div>
										{showCheckSnippet && (
											<CodeBlock
												snippets={[
													{
														title: "React",
														language: "typescript",
														displayLanguage: "typescript",
														content: `${
															checkData
																? `import { useCustomer } from 'autumn-js/react';

const { allowed } = useCustomer();

const handleCheckFeature = async () => {
if ( !allowed({ featureId: '${
																		lastUsedFeature?.featureId ||
																		features?.[0]?.id ||
																		"feature-id"
																	}' }) ) {
    alert('Feature not allowed');
  }
} `
																: "// Click 'Send' on a feature"
														}`,
													},
													{
														title: "Node.js",
														language: "typescript",
														displayLanguage: "typescript",
														content: `${
															checkData
																? `import { Autumn } from 'autumn-js';

const autumn = new Autumn({
  secretKey: 'am_sk_1234567890'
});

const { data } = await autumn.check({
  customerId: 'user_123',
  featureId: '${
		lastUsedFeature?.featureId || features?.[0]?.id || "feature-id"
	}'
});
`
																: "// Click 'Send' on a feature"
														}`,
													},
													{
														title: "Response",
														language: "typescript",
														displayLanguage: "typescript",
														content: `${
															checkData
																? JSON.stringify(checkData, null, 2)
																: "// Click 'Send' on a feature"
														}`,
													},
												]}
											/>
										)}
									</div>

									<div className="flex flex-col">
										<div className="flex items-center justify-between mb-1">
											<span className="text-sm text-t2">Track usage</span>
											<Button
												variant="ghost"
												size="sm"
												onClick={() => setShowTrackSnippet(!showTrackSnippet)}
												className="h-6 w-6 p-0"
											>
												{showTrackSnippet ? (
													<ChevronDown size={12} />
												) : (
													<ChevronRight size={12} />
												)}
											</Button>
										</div>
										{showTrackSnippet && (
											<CodeBlock
												snippets={[
													{
														title: "React",
														language: "typescript",
														displayLanguage: "typescript",
														content: `${
															trackData
																? `import { useCustomer } from 'autumn-js/react';

const { track } = useCustomer();

const handleTrackUsage = async () => {
  await track({ 
    featureId: '${
			lastUsedFeature?.featureId || features?.[0]?.id || "feature-id"
		}',
    value: ${lastUsedFeature?.value || 1}
  });
};`
																: "// Click 'Send' on a feature"
														}`,
													},
													{
														title: "Node.js",
														language: "typescript",
														displayLanguage: "typescript",
														content: `${
															trackData
																? `import { Autumn } from 'autumn-js';

const autumn = new Autumn({
  secretKey: 'am_sk_1234567890'
});

const response = await autumn.track({
  featureId: '${
		lastUsedFeature?.featureId || features?.[0]?.id || "feature-id"
	}',
  value: ${lastUsedFeature?.value || 1}
});
`
																: "// Click 'Send' on a feature"
														}`,
													},
													{
														title: "Response",
														language: "typescript",
														displayLanguage: "typescript",
														content: `${
															trackData
																? JSON.stringify(trackData, null, 2)
																: "// Click 'Send' on a feature"
														}`,
													},
												]}
											/>
										)}
									</div>

									<div className="flex flex-col">
										<div className="flex items-center justify-between mb-1">
											<span className="text-sm text-t2">Customer data</span>
											<Button
												variant="ghost"
												size="sm"
												onClick={() =>
													setShowCustomerSnippet(!showCustomerSnippet)
												}
												className="h-6 w-6 p-0"
											>
												{showCustomerSnippet ? (
													<ChevronDown size={12} />
												) : (
													<ChevronRight size={12} />
												)}
											</Button>
										</div>
										{showCustomerSnippet && (
											<CodeBlock
												snippets={[
													{
														title: "React",
														language: "typescript",
														displayLanguage: "typescript",
														content: `import { useCustomer } from 'autumn-js/react';

const { customer, refetch } = useCustomer();

console.log('Customer balance:', customer?.features.${
															lastUsedFeature?.featureId ||
															features?.[0]?.id ||
															"feature-id"
														}?.balance);

const handleTrackUsage = async () => {
  //refresh customer data after feature is used 
  await refetch();
};`,
													},
													{
														title: "Node.js",
														language: "typescript",
														displayLanguage: "typescript",
														content: `import { Autumn } from 'autumn-js';

const autumn = new Autumn({
  secretKey: 'am_sk_1234567890'
});

const { customer } = await autumn.customers.get('user_123');`,
													},
													{
														title: "Response",
														language: "typescript",
														displayLanguage: "typescript",
														content: `${
															customer
																? JSON.stringify(customer, null, 2)
																: "// Customer data will appear here"
														}`,
													},
												]}
											/>
										)}
									</div>
								</div>
							</div>
						</div>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
};

// Wrapper component to handle PaywallDialog independently
const PaywallWrapper = ({
	featureId,
	onClose,
}: {
	featureId: string;
	onClose: () => void;
}) => {
	const [paywallOpen, setPaywallOpen] = useState(true);

	const handlePaywallClose = useCallback(
		(open: boolean) => {
			setPaywallOpen(open);
			if (!open) {
				onClose();
			}
		},
		[onClose],
	);

	return (
		<PaywallDialog
			open={paywallOpen}
			setOpen={handlePaywallClose}
			featureId={featureId}
		/>
	);
};

const FeatureUsageItem = ({
	feature,
	customerFeature,
	onCheckData,
	onTrackData,
	onFeatureUsed,
}: {
	feature: any;
	customerFeature: any;
	onCheckData: (data: any) => void;
	onTrackData: (data: any) => void;
	onFeatureUsed: (feature: any) => void;
}) => {
	const { check, track, refetch } = useCustomer();
	const [trackValue, setTrackValue] = useState<number | string>(1);
	const [showPaywall, setShowPaywall] = useState(false);

	if (feature.type === "boolean") {
		return (
			<div className="flex flex-col w-48 h-16 bg-stone-100 px-2 py-1.5 border rounded-xs">
				<div
					className={cn(
						" text-xs uppercase rounded-md flex items-center gap-2 truncate",
						!customerFeature ? "text-t3" : "text-t2",
					)}
				>
					{feature.name || `Feature ${feature.id || "Unknown"}`}
					{customerFeature ? (
						<Check size={10} className="text-green-500" />
					) : (
						<Lock size={10} className="text-gray-400" />
					)}
				</div>
			</div>
		);
	}
	return (
		<div className="flex flex-col w-48 h-16 bg-stone-100 px-2 py-1.5 border rounded-xs justify-between">
			<div className="flex items-center gap-2 mb-2 justify-between">
				<div className="flex items-center gap-2">
					<span
						className={cn(
							"text-xs truncate uppercase",
							customerFeature ? "text-t2" : "text-t3",
						)}
					>
						{feature.name || `Feature ${feature.id || "Unknown"}`}
					</span>
					{!customerFeature && <Lock size={10} className="text-gray-400" />}
				</div>
			</div>
			<div className="flex items-center gap-2 text-t2 justify-between">
				<div className="flex items-center gap-2">
					<input
						type="number"
						value={customerFeature ? trackValue : ""}
						onChange={(e) => setTrackValue(e.target.value)}
						className="w-12 h-6 px-1 text-xs bg-white border rounded-xs text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
						disabled={!customerFeature}
					/>
					<Button
						variant="secondary"
						disabled={!customerFeature}
						className="h-6 px-2"
						onClick={async (e) => {
							// Prevent event bubbling to parent dialog
							e.stopPropagation();

							onFeatureUsed({
								featureId: customerFeature.id,
								value: Number(trackValue),
							});

							// Check without dialog first
							const { data: checkResponse } = check({
								featureId: customerFeature.id,
							});

							onCheckData(checkResponse);

							if (checkResponse?.allowed) {
								toast.success(`Used ${trackValue} ${feature.name}`);
								const { data: trackResponse } = await track({
									featureId: customerFeature.id,
									value: Number(trackValue),
								});
								onTrackData(trackResponse);
								await refetch();
							} else {
								// Show custom paywall if not allowed
								setShowPaywall(true);
							}
						}}
					>
						<Send size={10} />
					</Button>
				</div>
				{customerFeature && (
					<span className="text-sm text-t2">
						{customerFeature.unlimited
							? "unlimited"
							: `${customerFeature.usage}${
									customerFeature.included_usage > 0
										? ` / ${customerFeature.included_usage}`
										: ""
								}`}
					</span>
				)}
			</div>
			{showPaywall && (
				<PaywallWrapper
					featureId={customerFeature.id}
					onClose={() => setShowPaywall(false)}
				/>
			)}
		</div>
	);
};
