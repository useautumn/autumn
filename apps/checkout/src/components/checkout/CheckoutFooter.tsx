import autumnLogo from "@/assets/autumn.svg";

export function CheckoutFooter() {
	return (
		<a
			href="https://useautumn.com"
			target="_blank"
			rel="noopener noreferrer"
			className="flex items-center justify-center gap-1 group focus-visible:underline outline-none"
		>
			<span className="text-base text-muted-foreground">Powered by</span>
			<img
				src={autumnLogo}
				alt="Autumn"
				className="h-6 w-6 grayscale transition-all duration-300 group-hover:grayscale-0"
			/>
			<span className="text-base text-muted-foreground">Autumn</span>
		</a>
	);
}
