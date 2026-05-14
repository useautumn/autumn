export function AutumnMark({ size = 14 }: { size?: number }) {
	return (
		<svg
			aria-hidden="true"
			width={size}
			height={size}
			viewBox="0 0 28 28"
			fill="currentColor"
			xmlns="http://www.w3.org/2000/svg"
		>
			<rect width="28" height="28" rx="4" />
			<path
				d="M10.7139 9.06887C9.77726 11.211 8.84052 13.3532 7.90386 15.4953C8.63795 16.4465 9.37205 17.3984 10.1061 18.3496C12.2827 15.537 14.4599 12.7244 16.637 9.91183L9.27077 22.9514C12.9161 20.7518 16.5615 18.5529 20.2069 16.3534V4.85034L10.7139 9.06887Z"
				fill="var(--color-card)"
			/>
		</svg>
	);
}

export function StripeMark({ size = 14 }: { size?: number }) {
	return (
		<svg
			aria-hidden="true"
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="currentColor"
			xmlns="http://www.w3.org/2000/svg"
		>
			<rect width="24" height="24" rx="4" />
			<path d="M5.5 8L20.5 5L18.5 16L3.5 19Z" fill="var(--color-card)" />
		</svg>
	);
}
