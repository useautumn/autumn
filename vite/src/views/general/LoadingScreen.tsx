"use client";

import { LoadingShimmerText } from "@autumn/ui";
import React from "react";
import { cn } from "@/lib/utils";

function LoadingScreen({ fullPage = false }: { fullPage?: boolean }) {
	const texts = [
		"Counting pennies",
		"Forging plans",
		"Increasing ARR",
		"Optimizing pricing",
		"Blasting competitors",
		"Shipping faster",
		"Stopping churn",
		"Ayushhhing...",
	];

	const [loadingText, setLoadingText] = React.useState(texts[0]);

	React.useEffect(() => {
		let currentIndex = 0;

		setLoadingText(texts[Math.floor(Math.random() * texts.length)]);

		const interval = setInterval(() => {
			currentIndex = (currentIndex + 1) % texts.length;
			setLoadingText(texts[currentIndex]);
		}, 1000);

		return () => clearInterval(interval);
	}, []);

	// return (
	// 	<div className="flex h-full overflow-hidden w-full items-center justify-center flex-col gap-4">
	// 		<LoaderCircle className="animate-spin text-primary" size={30} />
	// 		<p className="text-muted-foreground font-mono text-xs font-medium">{loadingText}</p>
	// 	</div>
	// );
	return (
		<div
			className={cn(
				"flex w-full items-center justify-center flex-col gap-4",
				fullPage ? "min-h-screen" : "h-full",
			)}
		>
			<LoadingShimmerText
				text={loadingText}
				className="py-4 text-tiny-id justify-center whitespace-nowrap"
			/>
		</div>
	);
}

export default LoadingScreen;
