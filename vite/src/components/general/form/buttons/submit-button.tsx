import { Button } from "@autumn/ui";
import { useFormContext } from "@/hooks/form/form-context";
import { cn } from "@/lib/utils";
import { SmallSpinner } from "@autumn/ui";

export function SubmitButton({ label }: { label: string }) {
	const form = useFormContext();
	return (
		<form.Subscribe selector={(state) => state.isSubmitting}>
			{(isSubmitting) => (
				<Button
					className={cn(isSubmitting && "cursor-default")}
					disabled={isSubmitting}
					type="submit"
				>
					{isSubmitting ? <SmallSpinner /> : label}
				</Button>
			)}
		</form.Subscribe>
	);
}
