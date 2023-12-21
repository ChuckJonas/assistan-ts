import {
  toPayload,
  METADATA_KEY,
  AssistantDefinition,
  FunctionTool,
} from "./definition";
import { Assistant, AssistantCreateParams, OpenAI } from "./types/openai";
import { diff } from "deep-diff";

export interface LinkedDefinition<T extends Record<string, FunctionTool>>
  extends AssistantDefinition<T> {
  openai: OpenAI;
  id: string;
}

export type LinkOptions = {
  /** pass a OpenAI id to retrieve by id instead of `metadata-->__key__` search */
  assistantId?: string;
  /** Will create assistant if not found. Default: `true` */
  allowCreate?: boolean;
  /** What to do if drift is detected.  Default: `update` */
  updateMode?: "update" | "throw" | "skip";
  afterCreate?: (assistant: Assistant) => void;
  beforeUpdate?: (
    diff: string[],
    local: AssistantCreateParams,
    remote: Assistant
  ) => boolean;
  afterUpdate?: (assistant: Assistant) => void;
};

export const link =
  <T extends Record<string, FunctionTool>>(
    definition: AssistantDefinition<T>
  ) =>
  async (
    openai: OpenAI,
    options: LinkOptions
  ): Promise<LinkedDefinition<T>> => {
    const {
      assistantId,
      allowCreate = true,
      updateMode = "update",
      afterCreate,
      afterUpdate,
      beforeUpdate = () => true,
    } = options;
    const local = toPayload(definition);
    let remote: Assistant | undefined;

    if (assistantId) {
      remote = await openai.beta.assistants.retrieve(assistantId);
    } else {
      const assistants = await openai.beta.assistants.list({ limit: 100 });
      remote = assistants.data.find(
        (assistant) =>
          (assistant.metadata as any)?.[METADATA_KEY] === definition.key
      );
    }

    if (remote && updateMode !== "skip") {
      const differences = findDifferences(remote, local);

      if (differences.length > 0) {
        if (
          updateMode === "update" &&
          beforeUpdate(differences, local, remote)
        ) {
          //update the assistant.
          // Note: In testing, this seems to use "json patch" style updates where it only changes explicitly set fields
          remote = await openai.beta.assistants.update(remote.id, local);
          afterUpdate?.(remote);
        } else {
          throw new Error(
            `Assistant with key ${definition.key} is out of sync with remote.  To automatically update, set 'updateMode' to 'update'`
          );
        }
      }
    }

    if (!remote && allowCreate) {
      //create the assistant
      remote = await openai.beta.assistants.create(local);
      afterCreate?.(remote);
    }

    if (!remote) {
      throw new Error();
    }

    return {
      ...definition,
      openai,
      id: remote.id,
    };
  };

const findDifferences = (
  remote: Assistant,
  local: Assistant | AssistantCreateParams
): string[] => {
  const comparisons: Record<string, boolean> = {
    name: remote.name === local.name,
    // description: remote.description === local.description,
    model: remote.model === local.model,
    tools: compareTools(remote.tools, local.tools),
  };

  return Object.keys(comparisons).filter((key) => !comparisons[key]);
};

const compareTools = (
  remote?: Assistant["tools"],
  local?: Assistant["tools"]
) => {
  remote?.sort();
  local?.sort();
  const differences = diff(remote, local);

  return (differences?.length ?? 0) === 0;
};
