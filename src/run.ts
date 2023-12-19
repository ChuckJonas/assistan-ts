import OpenAI from "openai";
import { initToolBox } from "./toolbox";
import { Run, ToolOutput } from "./types/types";

export interface RunOptions {
  /** How long to wait between polling for run completion */
  interval?: number;
  /** Abort controller to abort the run */
  abortCtrl?: AbortController;

  // TODO: callback
  // onStatusChange
  // onSubmitTools
  // onComplete
}

// TOOD: Rewrite
export const waitForRun =
  (toolbox: ReturnType<typeof initToolBox>) =>
  async ({
    openai,
    run,
    interval = 3000,
    abortCtrl,
  }: {
    openai: OpenAI;
    run: Run;
  } & RunOptions): Promise<Run> => {
    const abortSignal = abortCtrl?.signal;

    while (run.status === "queued" || run.status === "in_progress") {
      await new Promise((resolve) => setTimeout(resolve, interval));
      run = await openai.beta.threads.runs.retrieve(run.thread_id, run.id, {
        signal: abortSignal,
      });
    }

    // handle all actions
    if (run.status === "requires_action" && run.required_action) {
      const toolOutputs: ToolOutput[] = [];
      for (const toolCall of run.required_action.submit_tool_outputs
        .tool_calls) {
        const output = await toolbox.handleAction(toolCall);
        toolOutputs.push(output);
      }

      run = await openai.beta.threads.runs.submitToolOutputs(
        run.thread_id,
        run.id,
        {
          tool_outputs: toolOutputs,
        },
        { signal: abortSignal }
      );

      return await waitForRun(toolbox)({
        openai,
        run,
        interval,
        abortCtrl,
      });
    }

    return run;
  };
