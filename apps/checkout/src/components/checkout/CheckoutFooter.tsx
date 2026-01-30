import autumnLogo from "@/assets/autumn.svg";

interface CheckoutFooterProps {
	disabled?: boolean;
}

export function CheckoutFooter({ disabled = false }: CheckoutFooterProps) {
	return (
		<a
			href="https://useautumn.com"
			target="_blank"
			rel="noopener noreferrer"
			className={`flex items-center justify-center gap-1 group focus-visible:underline outline-none ${disabled ? "pointer-events-none" : ""}`}
		>
			<span className="text-base text-muted-foreground">Powered by</span>
			<img
				src={autumnLogo}
				alt="Autumn"
				className={`h-6 w-6 grayscale ${disabled ? "" : "group-hover:grayscale-0"} transition-all duration-600`}
			/>
			<span className="text-base text-muted-foreground">Autumn</span>
		</a>
	);
}
