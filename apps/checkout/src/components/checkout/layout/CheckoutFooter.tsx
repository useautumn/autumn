import autumnLogo from "@/assets/autumn.svg";
import { cn } from "@/lib/utils";

const transitionClass = "transition-all duration-300";

export function CheckoutFooter() {
	return (
		<a
			href="https://useautumn.com"
			target="_blank"
			rel="noopener noreferrer"
			className="w-fit mx-auto flex items-center justify-center gap-0.5 group focus-visible:underline outline-none"
		>
			<span className={cn("text-xs text-muted-foreground group-hover:text-foreground", transitionClass)}>Powered by</span>
			<img
				src={autumnLogo}
				alt="Autumn"
				className={cn("h-4.5 w-4.5 grayscale group-hover:grayscale-0", transitionClass)}
			/>
			<span className={cn("text-xs text-muted-foreground group-hover:text-foreground", transitionClass)}>Autumn</span>
		</a>
	);
}
