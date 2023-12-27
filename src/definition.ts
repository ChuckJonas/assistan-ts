import { Kind, TSchema, Type } from "@sinclair/typebox";

import { link } from "./link";
import {
  AssistantCreateParams,
  AssistantFunction,
  OpenAI,
} from "./types/openai";
import { isNullType } from "./lib/typebox";

export const METADATA_KEY = "__key__";

// Identity function to assist with type inference
export const definition = <T extends Record<string, FunctionTool>>(
  definition: AssistantDefinition<T>
) => {
  return {
    ...definition,
    /** Find the matching assistant and sync the definition with openai */
    link: link(definition),
    /* Links the definition without calling OpenAI to find assistant */
    link__unsafe: (props: { openai: OpenAI; assistantId: string }) => {
      return {
        ...definition,
        openai: props.openai,
        id: props.assistantId,
      };
    },
  };
};

export interface AssistantDefinition<T extends Record<string, FunctionTool>>
  extends Omit<AssistantCreateParams, "tools"> {
  /** A unique key that is added to the assistant metadata in order to resolve the matching assistant */
  key: string;
  functionTools?: T;
  codeInterpreter?: boolean;
  retrieval?: boolean;
}

export const toPayload = (
  assistant: AssistantDefinition<any>
): AssistantCreateParams => {
  const {
    key,
    functionTools,
    codeInterpreter,
    retrieval,
    metadata: userMetadata,
    ...rest
  } = assistant;

  const tools = functionsToPayload(assistant);

  const metadata = {
    [METADATA_KEY]: assistant.key,
    ...(userMetadata ?? {}),
  };

  return {
    ...rest,
    tools,
    metadata,
  };
};

export const functionsToPayload = (
  def: Pick<
    AssistantDefinition<any>,
    "functionTools" | "codeInterpreter" | "retrieval"
  >
): AssistantCreateParams["tools"] => {
  const { functionTools, codeInterpreter = false, retrieval = false } = def;
  const functions = Object.keys(functionTools).map<AssistantFunction>(
    (toolKey) => {
      // TODO: fix hack to deal with undefined type complexity.
      // (currently mutates def which is problematic)
      if (isNullType(functionTools[toolKey].parameters)) {
        functionTools[toolKey]["parameters"] = null as any;
      }
      return {
        type: "function",
        function: { name: toolKey, ...functionTools[toolKey] },
      };
    }
  );

  const tools: AssistantCreateParams["tools"] = [
    ...functions,
    ...(codeInterpreter ? [{ type: "code_interpreter" } as const] : []),
    ...(retrieval ? [{ type: "retrieval" } as const] : []),
  ];

  return tools;
};

export type FunctionTool = Omit<
  AssistantFunction["function"],
  "parameters" | "name"
> & {
  parameters: TSchema;
};
