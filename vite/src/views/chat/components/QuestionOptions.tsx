import { Button } from "@autumn/ui";
import type { LeafQuestionData, LeafQuestionResponse } from "../chatTypes";

export function QuestionOptions({
	onAnswer,
	question,
}: {
	onAnswer: (answer: string, response?: LeafQuestionResponse) => void;
	question: LeafQuestionData;
}) {
	if (question.status === "answered") return null;
	return (
		<div className="flex flex-wrap gap-2 pt-1">
			{question.options.map((option) => {
				const label = option.label ?? option.id;
				if (!label) return null;
				const optionId = option.id ?? label;
				return (
					<Button
						key={optionId}
						onClick={() =>
							onAnswer(
								label,
								question.requestId
									? { optionId, requestId: question.requestId }
									: undefined,
							)
						}
						size="sm"
						variant="secondary"
					>
						{label}
					</Button>
				);
			})}
		</div>
	);
}
