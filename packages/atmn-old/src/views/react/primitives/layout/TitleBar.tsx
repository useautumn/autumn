import { Box, Text } from "ink";

export interface TitleBarItem {
	label: string;
	value: string;
	color?: string;
}

export interface TitleBarProps {
	commandName: string;
	version?: string;
	paginationText?: string;
	searchQuery?: string;
	extraItems?: TitleBarItem[];
}

export function TitleBar({
	commandName,
	version,
	paginationText,
	searchQuery,
	extraItems,
}: TitleBarProps) {
	return (
		<Box
			borderStyle="round"
			borderColor="gray"
			paddingX={1}
			width="100%"
			justifyContent="center"
		>
			{version && (
				<>
					<Text color="gray">{version}</Text>
					<Text color="gray"> │ </Text>
				</>
			)}
			<Text bold color="white">
				{commandName}
			</Text>
			{paginationText && (
				<>
					<Text color="gray"> │ </Text>
					<Text color="gray">{paginationText}</Text>
				</>
			)}
			{extraItems?.map((item) => (
				<Text key={`${item.label}-${item.value}`}>
					<Text color="gray"> │ </Text>
					<Text color="gray">{item.label}: </Text>
					<Text color={item.color ?? "white"}>{item.value}</Text>
				</Text>
			))}
			{searchQuery && (
				<>
					<Text color="gray"> │ </Text>
					<Text color="magenta">search: </Text>
					<Text color="white">{searchQuery}</Text>
					<Text color="gray"> (x to clear)</Text>
				</>
			)}
		</Box>
	);
}
