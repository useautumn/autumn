import autumnLogo from "@/assets/autumn.svg";
import { cn } from "@/lib/utils";

const transitionClass = "transition-all duration-300";

export function CheckoutFooter() {
	return (
		<a
			href="https://useautumn.com"
			target="_blank"
			rel="noopener noreferrer"
			className="flex items-center justify-center gap-[3px] group focus-visible:underline outline-none"
		>
			<span className={cn("text-sm text-muted-foreground group-hover:text-foreground", transitionClass)}>Powered by</span>
			<img
				src={autumnLogo}
				alt="Autumn"
				className={cn("h-5 w-5 grayscale group-hover:grayscale-0", transitionClass)}
			/>
			<span className={cn("text-sm text-muted-foreground group-hover:text-foreground", transitionClass)}>Autumn</span>
		</a>
	);
}
