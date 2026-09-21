const iconPaths = {
	agent: "m3 4 4 4-4 4m6 0h4",
	user: "M10.75 5a2.75 2.75 0 1 1-5.5 0 2.75 2.75 0 0 1 5.5 0ZM3 14v-1a5 5 0 0 1 10 0v1",
	key: "M7.5 5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm-1 2 7 7m-4-4 2-2m0 4 2-2",
	check: "m3 8 3 3 7-7",
} as const;

export function AuthDiagramIcon({ kind }: { kind: keyof typeof iconPaths }) {
	return (
		<svg
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.25"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<path d={iconPaths[kind]} />
		</svg>
	);
}
