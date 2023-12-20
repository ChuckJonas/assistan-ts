import type OpenAI from "openai";

export { OpenAI };

export type Assistant = OpenAI.Beta.Assistants.Assistant;

export type AssistantCreateParams =
  OpenAI.Beta.Assistants.AssistantCreateParams;
export type AssistantFunction = OpenAI.Beta.Assistants.Assistant.Function;

export type Run = OpenAI.Beta.Threads.Runs.Run;
export type RunCreateParams = OpenAI.Beta.Threads.Runs.RunCreateParams;
export type RunSubmitToolOutputsParams =
  OpenAI.Beta.Threads.Runs.RunSubmitToolOutputsParams;

export type ToolOutput =
  OpenAI.Beta.Threads.Runs.RunSubmitToolOutputsParams.ToolOutput;

export type RequiredActionFunctionToolCall =
  OpenAI.Beta.Threads.Runs.RequiredActionFunctionToolCall;
