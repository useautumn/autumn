import { useId } from "react";

export const FeatureArrowIcon = () => {
	return (
		<svg
			width="4"
			height="4"
			viewBox="0 0 4 4"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
		>
			<path d="M2.33 2L0.58 3.35L0.58 0.65L2.33 2Z" fill="#C3C3C3" />
			<title>Arrow</title>
		</svg>
	);
};

export const IncludedUsageIcon = ({ size = 16 }: { size?: number }) => {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 16 16"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
		>
			<title>Included Usage</title>
			<path
				d="M6 7.5C8.76142 7.5 11 6.49264 11 5.25C11 4.00736 8.76142 3 6 3C3.23858 3 1 4.00736 1 5.25C1 6.49264 3.23858 7.5 6 7.5Z"
				stroke="#666666"
				stroke-width="1.1"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
			<path
				d="M1 5.25V7.75C1 8.9925 3.23875 10 6 10C8.76125 10 11 8.9925 11 7.75V5.25"
				stroke="#666666"
				stroke-width="1.1"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
			<path
				d="M11.0001 6.04492C13.2826 6.25367 15.0001 7.16117 15.0001 8.24992C15.0001 9.49242 12.7613 10.4999 10.0001 10.4999C8.77508 10.4999 7.65258 10.3018 6.7832 9.97242"
				stroke="#666666"
				stroke-width="1.1"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
			<path
				d="M5 9.955V10.75C5 11.9925 7.23875 13 10 13C12.7613 13 15 11.9925 15 10.75V8.25"
				stroke="#666666"
				stroke-width="1.1"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
			<path
				d="M2.97266 13.0276L13.0298 2.97046"
				stroke="white"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
			<path
				d="M2.85352 14.5469L14.6465 2.75391"
				stroke="#666666"
				stroke-width="1.1"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</svg>
	);
};

export const PrepaidUsageIcon = () => {
	return (
		<svg
			width="16"
			height="16"
			viewBox="0 0 16 16"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
		>
			<title>Prepaid Usage</title>
			<g clipPath="url(#clip0_632_11624)">
				<path
					d="M5.75586 8.1543C8.51728 8.1543 10.7559 7.14694 10.7559 5.9043C10.7559 4.66166 8.51728 3.6543 5.75586 3.6543C2.99444 3.6543 0.755859 4.66166 0.755859 5.9043C0.755859 7.14694 2.99444 8.1543 5.75586 8.1543Z"
					stroke="#666666"
					strokeWidth="1.1"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
				<path
					d="M0.755859 5.9043V8.4043C0.755859 9.6468 2.99461 10.6543 5.75586 10.6543C8.51711 10.6543 10.7559 9.6468 10.7559 8.4043V5.9043"
					stroke="#666666"
					strokeWidth="1.1"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
				<path
					d="M10.7579 6.69922C13.0404 6.90797 14.7579 7.81547 14.7579 8.90422C14.7579 10.1467 12.5191 11.1542 9.75789 11.1542C8.53289 11.1542 7.41039 10.9561 6.54102 10.6267"
					stroke="#666666"
					strokeWidth="1.1"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
				<path
					d="M4.75586 10.6093V11.4043C4.75586 12.6468 6.99461 13.6543 9.75586 13.6543C12.5171 13.6543 14.7559 12.6468 14.7559 11.4043V8.9043"
					stroke="#666666"
					strokeWidth="1.1"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
				<path
					d="M9.23047 3.45508L10.918 5.14258L14.8555 1.20508"
					stroke="white"
					strokeWidth="5"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
				<path
					d="M9.50977 3.10156L11.1973 4.78906L15.1348 0.851562"
					stroke="#666666"
					strokeWidth="1.2"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			</g>
			<defs>
				<clipPath id={useId()}>
					<rect width="16" height="16" fill="white" />
				</clipPath>
			</defs>
		</svg>
	);
};

export const UsageBasedIcon = () => {
	return (
		<svg
			width="16"
			height="16"
			viewBox="0 0 16 16"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
		>
			<title>Usage Based</title>
			<path
				d="M13.46 3.84009H2.54C1.96562 3.84009 1.5 4.30571 1.5 4.88009V11.1201C1.5 11.6945 1.96562 12.1601 2.54 12.1601H13.46C14.0344 12.1601 14.5 11.6945 14.5 11.1201V4.88009C14.5 4.30571 14.0344 3.84009 13.46 3.84009Z"
				stroke="#666666"
				strokeWidth="1.1"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M9.30078 5.91992V10.0799"
				stroke="#666666"
				strokeWidth="1.1"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M6.69922 5.91992V10.0799"
				stroke="#666666"
				strokeWidth="1.1"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M4.09961 5.91992V10.0799"
				stroke="#666666"
				strokeWidth="1.1"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
};
