import { Static } from "@sinclair/typebox";
import { FunctionTool } from "./definition";

import { RequiredActionFunctionToolCall } from "openai/resources/beta/threads/runs/runs";
import { ToolOutput } from "./types/openai";
import { Value, ValueError } from "@sinclair/typebox/value";
import { registerTypeboxFormats } from "./lib/formats";
import { isNullType } from "./lib/typebox";

registerTypeboxFormats();

type Output = string | number | boolean | object;

export type ToolsDefsToToolbox<T extends Record<string, FunctionTool>> = {
  [key in keyof T]: (params: Static<T[key]["parameters"]>) => Promise<Output>;
};

type ToolContext = {
  action: RequiredActionFunctionToolCall;
  options: ToolOptions;
  toolDef?: FunctionTool;
};

export type ToolOptions = {
  /* Run JSONSchema validation before calling tool. default: true */
  validateArguments: boolean;

  /* Argument Parser */
  jsonParser: (args: string, ctx: ToolContext) => unknown;

  /* Argument Validator */
  validator: (args: unknown, ctx: ToolContext) => void;

  /* Chance to remap errors or throw a fatal 'fatal'.  By Default only `AssistantVisibleError` will be passed along */
  formatToolError: (error: unknown, ctx: ToolContext) => string;

  /* custom error messages on argument validation */
  formatValidationError: (errors: ValueError[], ctx: ToolContext) => string;

  /* Output Formatter */
  formatOutput: (output: Output, ctx: ToolContext) => string;
};

export const defaultOptions: ToolOptions = {
  jsonParser: defaultJsonParser,
  validator: defaultValidator,
  formatValidationError: defaultValidateFormatter,
  formatToolError: defaultErrorFormatter,
  validateArguments: true,
  formatOutput: defaultOutputFormatter,
};

export type ToolBox<T extends Record<string, FunctionTool>> = {
  toolDefs: T;
  toolsFn: ToolsDefsToToolbox<T>;
  options: ToolOptions;
  handleAction: (action: RequiredActionFunctionToolCall) => Promise<ToolOutput>;
};

// TODO: how to handle options and tool conflicts?
export const join = (...toolboxes: ToolBox<any>[]): ToolBox<any> => {
  const toolDefs = Object.assign({}, ...toolboxes.map((it) => it.toolDefs));
  const toolsFn = Object.assign({}, ...toolboxes.map((it) => it.toolsFn));
  return toolbox(toolDefs, toolsFn, toolboxes[0]?.options);
};

export const filter = <T extends Record<string, FunctionTool>>(
  tb: ToolBox<T>,
  filter: (key: string, tool: FunctionTool) => boolean
): ToolBox<any> => {
  const toolDefs = Object.fromEntries(
    Object.entries(tb.toolDefs).filter(([key, tool]) => filter(key, tool))
  );
  const toolsFn = Object.fromEntries(
    Object.entries(tb.toolsFn).filter(([key, tool]) => filter(key, tool))
  );
  return toolbox(toolDefs, toolsFn, tb.options);
};

export const toolbox = <T extends Record<string, FunctionTool>>(
  toolDefs: T,
  toolsFn: ToolsDefsToToolbox<T>,
  options: Partial<ToolOptions> = defaultOptions
): ToolBox<T> => {
  const opts = { ...defaultOptions, ...options };
  const { jsonParser, validator, formatOutput, formatToolError } = opts;
  return {
    toolDefs,
    toolsFn,
    options: opts,
    handleAction: async (
      action: RequiredActionFunctionToolCall
    ): Promise<ToolOutput> => {
      const toolDef = toolDefs?.[action.function.name];

      const ctx: ToolContext = { action, options: opts, toolDef };
      try {
        if (!toolDef)
          throw new AssistantVisibleError(
            `Tool key not found: ${
              action.function.name
            }. Please select from ${Object.keys(toolDefs as any).toString()}`
          );
        let output: Output;
        if (!toolDef?.parameters || isNullType(toolDef.parameters)) {
          output = await toolsFn[action.function.name](undefined);
        } else {
          const args = jsonParser(action.function.arguments, ctx);
          validator(args, ctx);
          output = await toolsFn[action.function.name](args);
        }

        return {
          tool_call_id: action.id,
          output: formatOutput(output, ctx),
        };
      } catch (e) {
        return {
          tool_call_id: action.id,
          output: formatToolError(e, ctx),
        };
      }
    },
  };
};

function defaultJsonParser(args: string, ctx: ToolContext) {
  try {
    return JSON.parse(args);
  } catch (e) {
    throw new AssistantVisibleError(`Invalid JSON: ${args}`);
  }
}

function defaultValidator(args: unknown, ctx: ToolContext) {
  if (ctx.options.validateArguments && ctx.toolDef) {
    // const validate = ajv.compile(ctx.toolDef.parameters);
    const errors = [...Value.Errors(ctx.toolDef.parameters, args)];
    const valid = errors.length === 0;
    if (valid === false) {
      throw new AssistantVisibleError(
        ctx.options.formatValidationError(errors ?? [], ctx)
      );
    }
  }
}

function defaultValidateFormatter(errors: ValueError[]) {
  return errors.map((it) => `arguments${it.path} ${it.message}`).join("\n");
}

function defaultOutputFormatter(output: Output) {
  switch (typeof output) {
    case "string":
      return output;
    case "number":
    case "boolean":
      return output + "";
    case "object":
      return JSON.stringify(output);
  }
}

function defaultErrorFormatter(error: unknown, ctx: ToolContext) {
  if (error instanceof AssistantVisibleError) {
    return `Error calling ${ctx.action.function.name}: ${error.message}`;
  }
  throw error;
}

/**
 * Throw this if you want your assistant to receive the error message
 */
export class AssistantVisibleError extends Error {
  constructor(message?: string) {
    super(message); // Pass the message to the parent class Error

    // This line makes stack traces work correctly, do not remove it!
    Object.setPrototypeOf(this, AssistantVisibleError.prototype);

    // Set the name of the error class as CustomError.
    this.name = "AssistantVisibleError";
  }
}
