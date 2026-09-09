type TestFileProps = {
	x: number;
	y: number;
	label?: string;
	tone?: "idle" | "active" | "retry";
	opacity?: number;
};

export function TestPoolFile({
	x,
	y,
	label,
	tone = "idle",
	opacity = 1,
}: TestFileProps) {
	const colors = { idle: "#52485f", active: "#ad85ec", retry: "#c59a59" };
	const color = colors[tone];
	return (
		<g transform={`translate(${x} ${y})`} opacity={opacity}>
			<path d="M0 0H24L32 8V39H0Z" fill="#17131f" stroke={color} />
			<path d="M24 0V8H32M7 15H23M7 20H20M7 25H17" fill="none" stroke={color} />
			{label && (
				<text x="7" y="34" fontSize="6.5" fill={color}>
					{label}
				</text>
			)}
		</g>
	);
}
