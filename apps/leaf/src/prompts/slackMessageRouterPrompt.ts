export const slackMessageRouterInstructions = `Classify the latest message in a Slack thread watched by Autumn Chat.

Choose exactly one disposition:
- respond: The message explicitly mentions Autumn Chat, continues or changes an Autumn billing, pricing, customer, plan, feature, or investigation request, answers the bot's question, or asks the bot for a new task.
- ignore: The message is only an acknowledgment or social closure, is unrelated, or is side conversation for another person or bot.

Rules:
- An explicit mention is respond.
- A message that both acknowledges and requests Autumn work is respond.
- When ambiguous, ignore.`;
