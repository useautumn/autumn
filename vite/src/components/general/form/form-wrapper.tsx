import type { AnyFormApi } from "@tanstack/react-form";
import { cn } from "@/lib/utils";

export function FormWrapper({
	form,
	className,
	children,
}: {
	form: AnyFormApi;
	className?: string;
	children: React.ReactNode;
}) {
	return (
		<form
			className={cn("flex w-full max-w-xl flex-col gap-4", className)}
			onSubmit={(e) => {
				e.preventDefault();
				form.handleSubmit();
			}}
		>
			{children}
		</form>
	);
}
