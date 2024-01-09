import { mock } from "bun:test";
import { Assistant, AssistantCreateParams, OpenAI } from "../../types/openai";

let _assistants: Record<string, Assistant> = {};

let _threads: Record<string, OpenAI.Beta.Threads.Thread> = {};
// threadId -> messages
let _threadMessages: Record<string, OpenAI.Beta.Threads.ThreadMessagesPage> =
  {};
let _runs: Record<string, OpenAI.Beta.Threads.Runs.Run> = {};

let _files: Record<string, OpenAI.Files.FileObject> = {};

export const reset = () => {
  _assistants = {};
  _threads = {};
  _threadMessages = {};
  _runs = {};
  mocked.beta.assistants.create.mockClear();
  mocked.beta.assistants.update.mockClear();
  mocked.beta.assistants.retrieve.mockClear();
  mocked.beta.assistants.update.mockClear();
  mocked.beta.threads.create.mockClear();
  mocked.beta.threads.messages.list.mockClear();
  mocked.beta.threads.runs.create.mockClear();
  mocked.beta.threads.runs.retrieve.mockClear();
  mocked.beta.threads.runs.update.mockClear();
  mocked.beta.threads.runs.submitToolOutputs.mockClear();
  mocked.files.create.mockClear();
  mocked.files.retrieve.mockClear();
  mocked.files.del.mockClear();
};

export const mocked = {
  files: {
    create: mock(
      (params: {
        purpose: "assistants";
        file: File;
      }): Promise<OpenAI.Files.FileObject> => {
        const newFile: OpenAI.Files.FileObject = {
          id: generateId(),
          object: "file",
          created_at: new Date().getTime(),
          bytes: params.file.size,
          status: "uploaded",
          filename: params.file.name,
          purpose: params.purpose,
        };
        _files[newFile.id] = newFile;
        return Promise.resolve(newFile);
      }
    ),
    retrieve: mock((file_id: string) => {
      return Promise.resolve(_files[file_id]);
    }),
    del: mock((file_id: string) => {
      delete _files[file_id];
      return Promise.resolve();
    }),
  },
  beta: {
    assistants: {
      retrieve: mock(
        (assistant_id: string): Promise<Assistant> =>
          Promise.resolve(_assistants[assistant_id])
      ),
      list: mock((params: any): Promise<OpenAI.Beta.AssistantsPage> => {
        return Promise.resolve({
          data: Object.values(_assistants),
        } as OpenAI.Beta.AssistantsPage);
      }),
      create: mock((params: AssistantCreateParams) => {
        const newAssistant: Assistant = {
          id: generateId(),
          object: "assistant",
          created_at: new Date().getTime(),
          description: "",
          instructions: "",
          name: "",
          tools: [],
          metadata: {},
          file_ids: [],
          ...params,
        };
        _assistants[newAssistant.id] = newAssistant;
        return Promise.resolve(newAssistant);
      }),
      update: mock((assistant_id: string, params: Assistant) => {
        _assistants[assistant_id] = {
          ..._assistants[assistant_id],
          ...params,
        };
        return Promise.resolve(_assistants[assistant_id]);
      }),
    },
    threads: {
      create: mock((params: any) => {
        const newThread: OpenAI.Beta.Threads.Thread = {
          id: "thread_" + generateId(),
          object: "thread",
          created_at: new Date().getTime(),
          metadata: {},
          ...params,
        };
        _threadMessages[newThread.id] = {
          data: [],
        } as any as OpenAI.Beta.Threads.Messages.ThreadMessagesPage;
        _threads[newThread.id] = newThread;
        return Promise.resolve(newThread);
      }),
      retrieve: mock((thread_id: string) => {
        return Promise.resolve(_threads[thread_id]);
      }),
      messages: {
        list: mock(
          (
            thread_id: string,
            params: OpenAI.Beta.Threads.Messages.MessageListParams
          ) => {
            const messages = _threadMessages[thread_id];
            return Promise.resolve(messages);
          }
        ),
      },
      runs: {
        create: mock(
          (
            thread_id: string,
            params: OpenAI.Beta.Threads.Runs.RunCreateParams
          ) => {
            const { model, tools, instructions, ...rest } = params;
            const newRun: OpenAI.Beta.Threads.Runs.Run = {
              model: model ?? "gpt-4",
              tools: tools ?? [],
              id: "run_" + generateId(),
              started_at: Date.now(),
              status: "queued",
              instructions: instructions ?? "",
              metadata: {},
              cancelled_at: null,
              completed_at: null,
              expires_at: Date.now() + 1000 * 60 * 60 * 24 * 7,
              failed_at: null,
              file_ids: [],
              last_error: null,
              object: "thread.run",
              required_action: null,
              created_at: new Date().getTime(),
              thread_id,
              ...rest,
            };
            _runs[newRun.id] = newRun;
            return Promise.resolve(newRun);
          }
        ),
        retrieve: mock((threadId: string, run_id: string) => {
          return Promise.resolve(_runs[run_id]);
        }),
        update: mock(
          (
            run_id: string,
            params: OpenAI.Beta.Threads.Runs.RunUpdateParams
          ) => {
            _runs[run_id] = {
              ..._runs[run_id],
              ...params,
            };
            return Promise.resolve(_runs[run_id]);
          }
        ),
        submitToolOutputs: mock(
          (
            thread_id: string,
            run_id: string,
            params: OpenAI.Beta.Threads.Runs.RunSubmitToolOutputsParams
          ) => {
            const run = _runs[run_id];
            run.required_action = null;
            run.status = "in_progress";

            return Promise.resolve(run);
          }
        ),
      },
    },
  },
};

export default mocked as any as OpenAI;

/** Used to simulate status change */
export const simulate = (runId: string) => {
  const run = _runs[runId];
  if (!run) {
    throw new Error(`Run ${runId} not found`);
  }

  let _messageContent: OpenAI.Beta.Threads.Messages.MessageContentText.Text | null =
    null;

  let _requiredAction: OpenAI.Beta.Threads.Runs.Run["required_action"] | null =
    null;

  const simulation = async () => {
    while (run.status !== "completed") {
      await new Promise((resolve) => setTimeout(resolve, 100));

      if (run.status === "queued") {
        run.status = "in_progress";
        continue;
      }
      if (run.status === "in_progress" && _messageContent) {
        run.status = "completed";

        run.completed_at = Date.now();
        const message: OpenAI.Beta.Threads.ThreadMessage = {
          id: generateId(),
          run_id: run.id,
          thread_id: run.thread_id,
          object: "thread.message",
          assistant_id: run.assistant_id,
          metadata: {},
          role: "user",
          content: [{ type: "text", text: _messageContent }],
          created_at: Date.now(),
          file_ids: [],
        };
        _threadMessages[run.thread_id].data.push(message);
        continue;
      }
      if (run.status === "in_progress" && _requiredAction) {
        run.required_action = _requiredAction;
        run.status = "requires_action";
        continue;
      }
    }
  };
  return {
    simulation: simulation(),
    setCompleted: (
      content: OpenAI.Beta.Threads.Messages.MessageContentText.Text
    ) => {
      _messageContent = content;
    },
    setRequiresAction: (
      toolCalls: OpenAI.Beta.Threads.Runs.RequiredActionFunctionToolCall[]
    ) => {
      _requiredAction = {
        type: "submit_tool_outputs",
        submit_tool_outputs: {
          tool_calls: toolCalls,
        },
      };
    },
  };
};

function generateId(): string {
  const now = Date.now(); // Current timestamp in milliseconds
  const randomDigits = Array.from({ length: 10 }, () =>
    Math.floor(Math.random() * 10)
  ).join("");
  return `${now}${randomDigits}`;
}
