import { AutumnLogo } from "@/components/icons/AutumnLogo";
import { cn } from "@/lib/utils";

const transitionClass = "transition-all duration-300";

export function CheckoutFooter() {
	return (
		<a
			href="https://useautumn.com"
			target="_blank"
			rel="noopener noreferrer"
			className="w-fit mx-auto flex items-center justify-center gap-1.5 group focus-visible:underline outline-none"
		>
			<span className={cn("text-xs text-muted-foreground group-hover:text-foreground", transitionClass)}>Powered by</span>
			<AutumnLogo
				className={cn("h-4 w-auto text-muted-foreground group-hover:text-foreground", transitionClass)}
			/>
		</a>
	);
}
