import { mock } from "bun:test";
import { Assistant, AssistantCreateParams, OpenAI } from "../../types/openai";

let _assistants: Record<string, Assistant> = {};

export const reset = () => {
  _assistants = {};
  mocked.beta.assistants.create.mockClear();
  mocked.beta.assistants.update.mockClear();
  mocked.beta.assistants.retrieve.mockClear();
  mocked.beta.assistants.update.mockClear();
};

export const mocked = {
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
          id: new Date().getTime().toString(),
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
  },
};

export default mocked as any as OpenAI;
