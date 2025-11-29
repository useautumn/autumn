"use client";

import React from "react";
import { LoadingShimmerText } from "@/components/v2/LoadingShimmerText";

function LoadingScreen() {
	const texts = [
		"Counting pennies",
		"Forging plans",
		"Increasing ARR",
		"Optimizing pricing",
		"Blasting competitors",
		"Shipping faster",
		"Stopping churn",
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
	// 		<p className="text-t2 font-mono text-xs font-medium">{loadingText}</p>
	// 	</div>
	// );
	return (
		<div className="flex h-full w-full items-center justify-center flex-col gap-4">
			<LoadingShimmerText
				text={loadingText}
				className="py-4 text-tiny-id w-48 justify-start whitespace-nowrap overflow-visible translate-x-[25%]"
			/>
		</div>
	);
}

export default LoadingScreen;
