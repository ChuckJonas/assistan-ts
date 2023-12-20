/**
 * Agent CLI
 * Quick and dirty agent runner for demo'ing `assistan-ts`
 */
import readline from "node:readline/promises";
import type OpenAI from "openai";
import colors from "colors";
import { Assistant, ToolsRequired } from "assistan-ts";
import { Threads } from "openai/resources/beta/threads/threads";

const COLORS = {
  assistant: colors.blue,
  user: colors.green,
  actionRequest: colors.red,
};

export type AgentCLIOptions = {
  intro: string;
  write: (...msgs: string[]) => void;
  /** Pass false to run all actions without confirmation. Or pass an string[] of action keys to halt on.  Defaults to true */
  confirmToolRuns?: boolean | string[];
};

const DEFAULT_OPTIONS: AgentCLIOptions = {
  intro: "Hello, I am your assistant",
  write: console.log,
  confirmToolRuns: true,
};

export class AgentCLI {
  private rl: readline.Interface;
  private assistant: Assistant<any>;
  private thread: Threads.Thread | undefined = undefined;
  private openai: OpenAI;
  private options: AgentCLIOptions;

  constructor(assistant: Assistant<any>, options?: Partial<AgentCLIOptions>) {
    this.options = { ...DEFAULT_OPTIONS, ...(options ?? {}) };
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    this.assistant = assistant;
    this.openai = assistant.definition.openai;
  }

  async start() {
    this.options.write(
      COLORS.assistant(formatMessage("assistant", this.options.intro))
    );
    this.thread = await this.openai.beta.threads.create();

    let userChat = await this.chat("");
    while (userChat != "exit") {
      this.openai.beta.threads.messages.create(this.thread.id, {
        role: "user",
        content: userChat,
      });
      const { toolsRequired, complete } = await this.assistant.run.create({
        threadId: this.thread.id,
      });

      if (this.options.confirmToolRuns === false) {
        await complete();
      } else {
        let toolActions = await toolsRequired();
        while (toolActions) {
          const responses = await this.confirmTools(toolActions);

          if (!responses) {
            return;
          }
          toolActions = await toolActions.execute(responses);
        }
      }

      const messages = await this.openai.beta.threads.messages.list(
        this.thread.id
      );
      const lastMessage = messages.data[0];
      this.displayMessage(lastMessage);

      userChat = await this.chat("");
    }
  }

  async confirmTools(toolActions: ToolsRequired) {
    const overrides: Record<string, string> = {};

    const confirmOn = Array.isArray(this.options.confirmToolRuns)
      ? this.options.confirmToolRuns
      : [];

    for (const toolCall of toolActions.toolCalls) {
      this.options.write(
        COLORS.actionRequest(`Agent Requesting to Run: `),
        `${colors.bold(toolCall.function.name)}(${
          toolCall.function.arguments.cyan
        }`
      );

      // confirmToolRuns === false || action not in list
      if (
        this.options.confirmToolRuns !== true &&
        !confirmOn.includes(toolCall.function.name)
      ) {
        this.options.write(COLORS.actionRequest("auto-running..."));
        continue;
      }

      const answer = await this.chat(
        `Do you want to continue? ${colors.bold("y/n or provide redirection")}:`
      );

      if (answer === "y") {
        continue;
      } else if (answer == "n") {
        this.options.write("Canceling Action".red);
        overrides[toolCall.function.name] =
          "ACTION CANCELED: User has denied execution of this action";
      } else {
        overrides[toolCall.function.name] = answer;
      }
    }
    return overrides;
  }

  displayMessage(msg: OpenAI.Beta.Threads.Messages.ThreadMessage): void {
    this.options.write(COLORS.assistant(formatThreadMessage(msg)));
  }

  chat(prompt: string): Promise<string> {
    this.options.write(colors.italic(`${prompt}`));
    return this.rl.question(COLORS.user(`USER> `));
  }

  close(): void {
    this.rl?.close();
  }
}

const formatMessage = (role: string, msg: string) =>
  `${role.toLocaleUpperCase()}>\n${msg}`;

function formatThreadMessage(msg: OpenAI.Beta.Threads.Messages.ThreadMessage) {
  return formatMessage(
    msg.role,
    msg.content.map(formatMessageContent).join("\n")
  );
}

function formatMessageContent(
  message:
    | OpenAI.Beta.Threads.Messages.MessageContentText
    | OpenAI.Beta.Threads.Messages.MessageContentImageFile
) {
  switch (message.type) {
    case "text":
      return message.text.value;
    case "image_file":
      return `file: ${message.image_file.file_id}`;
  }
}
