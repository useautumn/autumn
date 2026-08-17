export const slackMessageRouterInstructions = `Classify the latest message in a Slack thread watched by Autumn Chat.

Choose exactly one disposition:
- respond: The message explicitly mentions Autumn Chat, continues or changes an Autumn billing, pricing, customer, plan, feature, or investigation request, answers the bot's question, or asks the bot for a new task.
- ignore: The message is only an acknowledgment or social closure, is unrelated, or is side conversation for another person or bot.
- unsubscribe: The message explicitly tells Autumn Chat or this bot to stop listening, leave the thread, or stop replying.

Rules:
- An explicit mention is respond unless the message explicitly asks the bot to stop.
- A message that both acknowledges and requests Autumn work is respond.
- Never unsubscribe merely because a message is unrelated.
- When ambiguous, ignore.`;
