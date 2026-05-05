export function PromoCodeInput({
	value,
	onChange,
	onSubmit,
	onBlurEmpty,
	isApplying,
	disabled,
}: {
	value: string;
	onChange: (value: string) => void;
	onSubmit: () => void;
	onBlurEmpty: () => void;
	isApplying: boolean;
	disabled: boolean;
}) {
	const code = value.trim();

	return (
		<form
			className="flex h-9 items-stretch rounded-lg border border-border bg-background transition-[box-shadow,border-color] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50"
			onSubmit={(event) => {
				event.preventDefault();
				if (!code || disabled) return;
				onSubmit();
			}}
		>
			<input
				autoFocus
				type="text"
				value={value}
				onChange={(event) => onChange(event.target.value)}
				onBlur={() => {
					if (!code) onBlurEmpty();
				}}
				placeholder="Promo code"
				className="min-w-0 flex-1 rounded-l-[7px] bg-transparent px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-50"
				disabled={disabled}
			/>
			<button
				type="submit"
				disabled={!code || disabled}
				className="rounded-r-[7px] border-l border-border px-3.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:text-muted-foreground disabled:hover:bg-transparent"
			>
				{isApplying ? "Applying..." : "Apply"}
			</button>
		</form>
	);
}
