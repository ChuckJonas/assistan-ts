import { ToolBox, initToolBox } from "./toolbox";
import { Run, ToolOutput, OpenAI } from "./types/openai";
import { RequiredActionFunctionToolCall } from "openai/resources/beta/threads/runs/runs";
import { FunctionTool } from "./definition";

export interface RunOptions {
  /** ms wait between polling for run completion. Default 1000 */
  interval?: number;

  /** Abort controller to abort the run */
  abortSignal?: AbortSignal;

  // executes anytime the status changes (within the execution of this function)
  onStatusChange?: (run: Run, previous: Run["status"]) => void;
}

type RunParams<T extends Record<string, FunctionTool>> = {
  toolbox: ToolBox<T>;
  openai: OpenAI;
} & RunOptions;

// TOOD: Rewrite
export const waitForComplete = async (
  run: Run,
  params: RunParams<any>
): Promise<Run> => {
  run = await poll(run, params);

  // handle all actions
  if (run.status === "requires_action" && run.required_action) {
    run = await runAndSubmitTools(run, params);

    return await waitForComplete(run, params);
  }

  return run;
};

/** Action  */

export type ToolsRequired = {
  toolCalls: RequiredActionFunctionToolCall[];
  execute: (
    responseOverrides?: Record<string, string>
  ) => Promise<ToolsRequiredResponse>;
};

export type ToolsRequiredResponse = {
  run: Run;
  toolsRequest: ToolsRequired | null;
};

export const waitForRequiredAction = async <
  T extends Record<string, FunctionTool>
>(
  run: Run,
  params: RunParams<T>
): Promise<ToolsRequiredResponse> => {
  run = await poll(run, params);

  // handle all actions
  if (run.status === "requires_action" && run.required_action) {
    return {
      run,
      toolsRequest: {
        toolCalls: run.required_action.submit_tool_outputs.tool_calls,
        execute: async (responseOverrides) => {
          run = await runAndSubmitTools(run, params, responseOverrides);
          return await waitForRequiredAction(run, params);
        },
      },
    };
  }

  return { run, toolsRequest: null };
};

async function runAndSubmitTools(
  run: Run,
  params: {
    toolbox: ReturnType<typeof initToolBox>;
    openai: OpenAI;
    abortSignal?: AbortSignal;
    onStatusChange?: (run: Run, previous: Run["status"]) => void;
  },
  responseOverrides: Record<string, string> = {}
) {
  const { toolbox, openai, abortSignal, onStatusChange } = params;
  let status = run.status;

  const toolCalls = run.required_action?.submit_tool_outputs.tool_calls ?? [];

  const overrides: ToolOutput[] =
    toolCalls
      .filter((it) => responseOverrides[it.function.name] !== undefined)
      .map((it) => ({
        tool_call_id: it.id,
        output: responseOverrides[it.function.name],
      })) ?? [];

  const toolPromises =
    toolCalls
      .filter((it) => responseOverrides[it.function.name] === undefined)
      .map((toolCall) =>
        toolbox.handleAction(toolCall).catch((e) => e as Error)
      ) ?? [];

  // TODO: Should we catch error and submit successes?
  const { resolved, rejected } = (await Promise.all(toolPromises)).reduce<{
    resolved: ToolOutput[];
    rejected: Error[];
  }>(
    (acc, cur) => {
      if (cur instanceof Error) {
        acc.rejected.push(cur);
      } else {
        acc.resolved.push(cur);
      }
      return acc;
    },
    { resolved: [], rejected: [] }
  );

  const tool_outputs = [...overrides, ...resolved];
  if (tool_outputs.length) {
    run = await openai.beta.threads.runs.submitToolOutputs(
      run.thread_id,
      run.id,
      {
        tool_outputs,
      },
      { signal: abortSignal }
    );
    if (run.status !== status) {
      onStatusChange?.(run, status);
      status = run.status;
    }
  }

  if (rejected.length > 0) {
    //TODO: throw multiple errors?
    throw rejected[0];
  }
  return run;
}

async function poll(run: Run, params: RunParams<any>) {
  const { openai, interval = 1000, abortSignal, onStatusChange } = params;
  let status = run.status;
  while (run.status === "queued" || run.status === "in_progress") {
    await new Promise((resolve) => setTimeout(resolve, interval));
    run = await openai.beta.threads.runs.retrieve(run.thread_id, run.id, {
      signal: abortSignal,
    });

    if (run.status !== status) {
      onStatusChange?.(run, status);
      status = run.status;
    }
  }
  return run;
}
