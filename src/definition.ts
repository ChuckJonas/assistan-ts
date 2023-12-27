import { Kind, TSchema, Type } from "@sinclair/typebox";

import { link } from "./link";
import {
  AssistantCreateParams,
  AssistantFunction,
  OpenAI,
} from "./types/openai";
import { isNullType } from "./lib/typebox";
import { FunctionDefinition } from "openai/resources";

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

  const tools = toolsToPayload(assistant);

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

export const toolsToPayload = (
  def: Pick<
    AssistantDefinition<any>,
    "functionTools" | "codeInterpreter" | "retrieval"
  >
): AssistantCreateParams["tools"] => {
  const { functionTools, codeInterpreter = false, retrieval = false } = def;
  const functions = functionsToPayload(functionTools);

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

export const functionsToPayload = <T extends Record<string, FunctionTool>>(
  functionTools: T
): AssistantFunction[] => {
  return Object.keys(functionTools).map((toolKey) => {
    // TODO: fix hack to deal with undefined type complexity.
    // (currently mutates def which is problematic)
    if (isNullType(functionTools[toolKey].parameters)) {
      functionTools[toolKey]["parameters"] = null as any;
    }
    return {
      type: "function",
      function: { name: toolKey, ...functionTools[toolKey] },
    };
  });
};
