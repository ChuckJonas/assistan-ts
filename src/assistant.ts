import { FunctionTool } from "./definition";
import { LinkedDefinition } from "./link";
import { RunOptions, waitForComplete, waitForRequiredAction } from "./run";
import { ToolOptions, ToolsDefsToToolbox, initToolBox } from "./toolbox";
import { OpenAI, Run, RunCreateParams } from "./types/types";

type Props<T extends Record<string, FunctionTool>> = {
  definition: LinkedDefinition<T>;
  tools: ToolsDefsToToolbox<T>;
  toolOptions?: ToolOptions;
};

export const assistant = <T extends Record<string, FunctionTool>>({
  definition,
  tools,
  toolOptions,
}: Props<T>) => {
  const toolbox = initToolBox(definition, tools, toolOptions);

  const setupRun = (run: Run) => ({
    run,
    toolsRequired: async (opts?: RunOptions) =>
      waitForRequiredAction(run, {
        toolbox,
        openai: definition.openai,
        ...opts,
      }),
    complete: async (opts?: RunOptions) =>
      waitForComplete(run, {
        toolbox,
        openai: definition.openai,
        ...opts,
      }),
  });

  return {
    definition,
    toolbox,
    run: {
      create: async (params: {
        threadId: string;
        body?: Omit<RunCreateParams, "assistant_id">;
        options?: OpenAI.RequestOptions;
      }) => {
        const { threadId, body, options } = params;

        const run = await definition.openai.beta.threads.runs.create(
          threadId,
          {
            assistant_id: definition.id,
            ...(body ?? {}),
          },
          options
        );
        return setupRun(run);
      },
      load: (run: Run) => {
        return setupRun(run);
      },
    },
  };
};
