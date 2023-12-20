import { FunctionTool } from "./definition";
import { LinkedDefinition } from "./link";
import {
  RunOptions,
  ToolsRequired,
  waitForComplete,
  waitForRequiredAction,
} from "./run";
import {
  ToolBox,
  ToolOptions,
  ToolsDefsToToolbox,
  initToolBox,
} from "./toolbox";
import { Run, RunCreateParams, OpenAI } from "./types/openai";

export type Assistant<T extends Record<string, FunctionTool>> = {
  definition: LinkedDefinition<T>;
  toolbox: ToolBox<T>;
  run: {
    create: (params: {
      threadId: string;
      body?: Omit<RunCreateParams, "assistant_id">;
      options?: OpenAI.RequestOptions;
    }) => Promise<{
      run: OpenAI.Beta.Threads.Runs.Run;
      toolsRequired: (opts?: RunOptions) => Promise<ToolsRequired | null>;
      complete: (opts?: RunOptions) => Promise<OpenAI.Beta.Threads.Runs.Run>;
    }>;
    load: (run: Run) => {
      run: OpenAI.Beta.Threads.Runs.Run;
      toolsRequired: (opts?: RunOptions) => Promise<ToolsRequired | null>;
      complete: (opts?: RunOptions) => Promise<OpenAI.Beta.Threads.Runs.Run>;
    };
  };
};

type Props<T extends Record<string, FunctionTool>> = {
  definition: LinkedDefinition<T>;
  tools: ToolsDefsToToolbox<T>;
  toolOptions?: ToolOptions;
};

export const assistant = <T extends Record<string, FunctionTool>>({
  definition,
  tools,
  toolOptions,
}: Props<T>): Assistant<T> => {
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
