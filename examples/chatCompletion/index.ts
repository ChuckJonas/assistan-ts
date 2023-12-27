/** Example showing how toolbox can be with Chat Completions API  */
import { OpenAI } from "openai";
import { toolbox, Type } from "assistan-ts";

const openai = new OpenAI({
  apiKey: process.env["OAI_KEY"],
});

(async () => {
  const tb = toolbox(
    {
      get_weather: {
        description: "Get the weather for a location",
        parameters: Type.Object({
          location: Type.String({
            description: "The location to get the weather for",
          }),
        }),
      },
      get_stock_price: {
        description: "gets the stock price for a company",
        parameters: Type.Object({
          companySymbol: Type.String({
            description: "The symbol for the company",
          }),
        }),
      },
    },
    {
      get_weather: async ({ location }) => {
        return `The weather in ${location} is ${Math.floor(
          Math.random() * 100
        )}F and ${
          ["sunny", "cloudy", "windy"][Math.floor(Math.random() * 4)]
        }']}`;
      },
      get_stock_price: async ({ companySymbol }) => {
        return `As of ${new Date().toLocaleDateString()}, the current price ${companySymbol} is $${Math.floor(
          Math.random() * 100
        )}$ per share`;
      },
    }
  );

  let messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: "user",
      // content: "How is the weather in Lander and Jackson wyoming?",
      content: "Is apple or microsoft more expensive at the moment?",
    },
  ];

  while (true) {
    const chat = (
      await openai.chat.completions.create({
        model: "gpt-4",
        messages,
        tools: tb.payload,
      })
    ).choices[0].message;

    messages.push(chat);

    if (chat.tool_calls) {
      for (const call of chat.tool_calls) {
        const toolResponse = await tb.handleAction(call);
        messages.push({
          role: "tool",
          tool_call_id: toolResponse.tool_call_id,
          content: toolResponse.output,
        });
      }
    } else {
      return chat.content;
    }
  }
})()
  .then(console.log)
  .catch(console.error);
