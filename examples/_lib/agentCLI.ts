/**
 * Agent CLI
 * Quick and dirty agent runner for demo'ing `assistan-ts`
 * TODO:
 * - [ ] control over "confirm" character {match: "", "label":""}
 */
import { Assistant, ToolsRequired } from "assistan-ts";
import colors from "colors";
import readline from "node:readline/promises";
import type OpenAI from "openai";
import { Threads } from "openai/resources/beta/threads/threads";
import {
  downloadFile,
  parseAnnotationsFromThread,
  parseImagesFromThread,
} from "./files";

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

  /** passed whenever a new run is started */
  beforeCreateRun?: () => Omit<
    OpenAI.Beta.Threads.Runs.RunCreateParams,
    "assistant_id"
  >;

  /** Use to restore existing thread */
  threadId?: string;
  // path to write generated files and images to
  outputPath?: string;
};

const DEFAULT_OPTIONS: AgentCLIOptions = {
  intro: "Hello, I am your assistant",
  write: console.log,
  confirmToolRuns: true,
};

export class AgentCLI {
  thread: Threads.Thread | undefined = undefined;
  private rl: readline.Interface;
  private assistant: Assistant<any>;
  private openai: OpenAI;
  private options: AgentCLIOptions;

  private queuedMessages: OpenAI.Beta.Threads.Messages.MessageCreateParams[] =
    [];

  constructor(assistant: Assistant<any>, options?: Partial<AgentCLIOptions>) {
    this.options = { ...DEFAULT_OPTIONS, ...(options ?? {}) };
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    this.assistant = assistant;
    this.openai = assistant.definition.openai;
  }

  start = async () => {
    if (this.options.threadId) {
      //load an existing thread and display past messages
      this.thread = await this.openai.beta.threads.retrieve(
        this.options.threadId
      );

      this.options.write(`Restoring From Thread: ${this.thread.id}}`);
      const messages = await this.openai.beta.threads.messages.list(
        this.thread.id
      );
      this.options.write(
        messages.data.map(this.formatThreadMessage).reverse().join("\n")
      );
    } else {
      this.thread = await this.openai.beta.threads.create();
      this.options.write(colors.italic(`Created Thread: ${this.thread.id}}`));
    }

    this.options.write(
      COLORS.assistant(formatMessage("assistant", this.options.intro))
    );

    let userChat = await this.chat("");
    while (userChat != "exit") {
      // pop all queued messages and create messages for them
      while (this.queuedMessages.length) {
        const message = this.queuedMessages.pop()!;
        await this.openai.beta.threads.messages.create(this.thread.id, message);
      }

      await this.openai.beta.threads.messages.create(this.thread.id, {
        role: "user",
        content: userChat,
      });
      let { toolsRequired } = await this.assistant.run.create({
        threadId: this.thread.id,
        body: this.options.beforeCreateRun
          ? this.options.beforeCreateRun()
          : {},
      });

      let { toolsRequest } = await toolsRequired();
      while (toolsRequest) {
        const responses = await this.confirmTools(toolsRequest);

        if (!responses) {
          return;
        }
        ({ toolsRequest } = await toolsRequest.execute(responses));
      }

      const messages = await this.openai.beta.threads.messages.list(
        this.thread.id
      );

      if (this.options.outputPath !== undefined) {
        await Promise.all(
          parseAnnotationsFromThread(messages).map((it) =>
            downloadFile(
              this.openai,
              it.file_path.file_id,
              this.options.outputPath!
            )
          )
        );

        await Promise.all(
          parseImagesFromThread(messages).map((it) =>
            downloadFile(
              this.openai,
              it.file_id,
              this.options.outputPath!,
              `${it.file_id}.png`
            )
          )
        );
      }

      const lastMessage = messages.data[0];
      this.displayMessage(lastMessage);

      userChat = await this.chat("");
    }
  };

  /** This is needed so tools can add messages while the run is active */
  queueMessage = (
    message: OpenAI.Beta.Threads.Messages.MessageCreateParams
  ) => {
    this.queuedMessages.push(message);
  };

  private confirmTools = async (toolActions: ToolsRequired) => {
    const overrides: Record<string, string> = {};

    const confirmOn = Array.isArray(this.options.confirmToolRuns)
      ? this.options.confirmToolRuns
      : [];

    for (const toolCall of toolActions.toolCalls) {
      this.options.write(
        COLORS.actionRequest(`Agent Requesting to Run: `),
        `${colors.bold(toolCall.function.name)}(${
          toolCall.function.arguments.cyan
        })`
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
        overrides[toolCall.id] =
          "ACTION CANCELED: User has denied execution of this action";
      } else {
        overrides[toolCall.id] = answer;
      }
    }
    return overrides;
  };

  private displayMessage = (
    msg: OpenAI.Beta.Threads.Messages.ThreadMessage
  ) => {
    this.options.write(COLORS.assistant(this.formatThreadMessage(msg)));
  };

  private chat = (prompt: string) => {
    this.options.write(colors.italic(`${prompt}`));
    return this.rl.question(COLORS.user(`USER> `));
  };

  formatThreadMessage = (msg: OpenAI.Beta.Threads.Messages.ThreadMessage) => {
    return formatMessage(
      msg.role,
      msg.content.map(this.formatMessageContent).join("\n")
    );
  };

  private formatMessageContent = (
    message:
      | OpenAI.Beta.Threads.Messages.MessageContentText
      | OpenAI.Beta.Threads.Messages.MessageContentImageFile
  ) => {
    switch (message.type) {
      case "text":
        return message.text.value;
      case "image_file":
        return `file: ${this.options.outputPath}/${message.image_file.file_id}.png`;
    }
  };

  close = () => {
    this.rl?.close();
  };
}

const formatMessage = (role: string, msg: string) =>
  `${role.toLocaleUpperCase()}>\n${msg}`;
