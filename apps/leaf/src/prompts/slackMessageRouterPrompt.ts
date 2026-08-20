export const slackMessageRouterInstructions = `Classify the latest message in a Slack thread watched by Autumn Chat.

Choose exactly one disposition:
- respond: The message explicitly mentions Autumn Chat, continues or changes an Autumn billing, pricing, customer, plan, feature, environment, organization, or investigation request, answers the bot's question, or asks the bot for a new task.
- ignore: The message is only an acknowledgment or social closure, is unrelated, or is side conversation for another person or bot.

Rules:
- An explicit mention is respond.
- A message that both acknowledges and requests Autumn work is respond.
- Read the latest message in the context of the recent messages. Follow-up questions can refer to prior subjects with words like "this", "that", "it", "we", or "our" without naming Autumn again.
- Questions such as "which org are you in?", "do we have customers in this env?", "what about live?", and "try again" are respond when they continue the thread.
- Do not treat the absence of an explicit mention as a reason to ignore a relevant follow-up.
- When genuinely ambiguous after considering the thread context, ignore.`;
