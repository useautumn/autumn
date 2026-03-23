import { Box, Text, useInput } from "ink";
import { useMemo, useState } from "react";

interface MultiSelectOption {
	label: string;
	value: string;
}

interface MultiSelectProps {
	options: MultiSelectOption[];
	defaultValue?: string[];
	visibleOptionCount?: number;
	onChange?: (values: string[]) => void;
	onSubmit?: (values: string[]) => void;
}

const POINTER = "\u276F";
const TICK = "\u2714";
const CIRCLE = "\u25CB";

export function MultiSelect({
	options,
	defaultValue = [],
	visibleOptionCount = 5,
	onChange,
	onSubmit,
}: MultiSelectProps) {
	const effectiveVisibleCount = Math.min(visibleOptionCount, options.length);

	const [focusedIndex, setFocusedIndex] = useState(0);
	const [selectedValues, setSelectedValues] = useState<Set<string>>(
		() => new Set(defaultValue),
	);
	const [visibleFrom, setVisibleFrom] = useState(0);

	const visibleOptions = useMemo(() => {
		return options.slice(visibleFrom, visibleFrom + effectiveVisibleCount);
	}, [options, visibleFrom, effectiveVisibleCount]);

	useInput((input, key) => {
		if (key.downArrow) {
			const nextIndex = Math.min(focusedIndex + 1, options.length - 1);
			setFocusedIndex(nextIndex);
			const visibleTo = visibleFrom + effectiveVisibleCount;
			if (nextIndex >= visibleTo) {
				setVisibleFrom(nextIndex - effectiveVisibleCount + 1);
			}
		}

		if (key.upArrow) {
			const prevIndex = Math.max(focusedIndex - 1, 0);
			setFocusedIndex(prevIndex);
			if (prevIndex < visibleFrom) {
				setVisibleFrom(prevIndex);
			}
		}

		if (input === " ") {
			const focusedOption = options[focusedIndex];
			if (!focusedOption) return;

			const newSelected = new Set(selectedValues);
			if (newSelected.has(focusedOption.value)) {
				newSelected.delete(focusedOption.value);
			} else {
				newSelected.add(focusedOption.value);
			}
			setSelectedValues(newSelected);
			onChange?.([...newSelected]);
		}

		if (key.return) {
			onSubmit?.([...selectedValues]);
		}
	});

	return (
		<Box flexDirection="column">
			{visibleOptions.map((option, i) => {
				const absoluteIndex = visibleFrom + i;
				const isFocused = absoluteIndex === focusedIndex;
				const isSelected = selectedValues.has(option.value);

				return (
					<Box key={option.value}>
						<Text color={isFocused ? "cyan" : undefined}>
							{isFocused ? POINTER : " "}{" "}
						</Text>
						<Text color={isSelected ? "green" : isFocused ? "cyan" : undefined}>
							{isSelected ? TICK : CIRCLE} {option.label}
						</Text>
					</Box>
				);
			})}
		</Box>
	);
}
