import { FunctionTool, toolsToPayload } from "./definition";
import { LinkedDefinition } from "./link";
import {
  RunOptions,
  ToolsRequiredResponse,
  waitForComplete,
  waitForRequiredAction,
} from "./run";
import {
  ToolBox,
  ToolOptions,
  ToolsDefsToToolbox,
  toolbox as initToolBox,
} from "./toolbox";
import { Run, RunCreateParams, OpenAI } from "./types/openai";

export type Assistant<T extends Record<string, FunctionTool>> = {
  /** A definition that has been "linked" to OpenAI */
  definition: LinkedDefinition<T>;
  /** The toolbox that was created from the definition + tool functions */
  toolbox: ToolBox<T>;
  /** Run related functions */
  run: {
    /** Create a new run */
    create: (params: {
      threadId: string;
      body?: Omit<RunCreateParams, "assistant_id">;
      options?: OpenAI.RequestOptions;
    }) => Promise<SetupRunResponse>;
    /** Load an existing run */
    load: (run: Run) => SetupRunResponse;
  };
};

type SetupRunResponse = {
  run: OpenAI.Beta.Threads.Runs.Run;
  toolsRequired: (opts?: RunOptions) => Promise<ToolsRequiredResponse>;
  complete: (opts?: RunOptions) => Promise<OpenAI.Beta.Threads.Runs.Run>;
};

type Props<T extends Record<string, FunctionTool>> = {
  /** A definition that has been "linked" to OpenAI */
  definition: LinkedDefinition<T>;
  /** Functions matching the tool definitions */
  tools: ToolsDefsToToolbox<T>;
  /** Options to pass to the toolbox */
  toolOptions?: Partial<ToolOptions>;
  /** Override the toolbox before creating a run
   * @param base The toolbox that was created from the definition
   */
  toolBoxOverride?: (base: ToolBox<T>) => ToolBox<any>;
};

export const assistant = <T extends Record<string, FunctionTool>>({
  definition,
  tools,
  toolOptions,
  toolBoxOverride: overrideToolbox,
}: Props<T>): Assistant<T> => {
  const toolbox = initToolBox(definition.functionTools!, tools, toolOptions);

  const setupRun = (
    run: Run,
    overriddenToolbox?: ToolBox<any>
  ): SetupRunResponse => ({
    run,
    toolsRequired: async (opts?: RunOptions) =>
      waitForRequiredAction(run, {
        toolbox: overriddenToolbox ?? toolbox,
        openai: definition.openai,
        ...opts,
      }),
    complete: async (opts?: RunOptions) =>
      waitForComplete(run, {
        toolbox: overriddenToolbox ?? toolbox,
        openai: definition.openai,
        ...opts,
      }),
  });

  return {
    definition,
    toolbox: toolbox,
    run: {
      create: async (params) => {
        const { threadId, body, options } = params;

        const overriddenToolbox = overrideToolbox?.(toolbox);
        const run = await definition.openai.beta.threads.runs.create(
          threadId,
          {
            assistant_id: definition.id,
            ...(body ?? {}),
            tools: overriddenToolbox
              ? toolsToPayload({
                  functionTools: overriddenToolbox.toolDefs,
                  retrieval: definition.retrieval,
                  codeInterpreter: definition.codeInterpreter,
                })
              : undefined,
          },
          options
        );
        return setupRun(run, overriddenToolbox);
      },
      load: (run: Run) => {
        return setupRun(run);
      },
    },
  };
};
