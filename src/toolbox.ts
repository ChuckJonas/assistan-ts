import { Type, Static, TSchema } from "@sinclair/typebox";
import { AssistantDefinition, FunctionTool, definition } from "./definition";
import addFormats from "ajv-formats";
import Ajv, { ErrorObject } from "ajv";
import { RequiredActionFunctionToolCall } from "openai/resources/beta/threads/runs/runs";
import { ToolOutput } from "./types/openai";

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
  formatValidationError: (
    errors: ErrorObject<string, Record<string, any>, unknown>[],
    ctx: ToolContext
  ) => string;

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
  toolsFn: ToolsDefsToToolbox<T>;
  options: ToolOptions;
  handleAction: (action: RequiredActionFunctionToolCall) => Promise<ToolOutput>;
};

export const initToolBox = <T extends Record<string, FunctionTool>>(
  definition: AssistantDefinition<T>,
  toolsFn: ToolsDefsToToolbox<T>,
  options: Partial<ToolOptions> = defaultOptions
): ToolBox<T> => {
  const opts = { ...defaultOptions, ...options };
  const { jsonParser, validator, formatOutput, formatToolError } = opts;
  return {
    toolsFn,
    options: opts,
    handleAction: async (
      action: RequiredActionFunctionToolCall
    ): Promise<ToolOutput> => {
      const toolDef = definition.functionTools?.[action.function.name];

      const ctx: ToolContext = { action, options: opts, toolDef };

      try {
        let output: Output;
        if (!toolDef?.parameters) {
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

const ajv = addFormats(new Ajv({ allErrors: true }), [
  "date-time",
  "time",
  "date",
  "email",
  "hostname",
  "ipv4",
  "ipv6",
  "uri",
  "uri-reference",
  "uuid",
  "uri-template",
  "json-pointer",
  "relative-json-pointer",
  "regex",
]);

function defaultJsonParser(args: string, ctx: ToolContext) {
  try {
    return JSON.parse(args);
  } catch (e) {
    throw new AssistantVisibleError(`Invalid JSON: ${args}`);
  }
}

function defaultValidator(args: unknown, ctx: ToolContext) {
  if (ctx.options.validateArguments && ctx.toolDef) {
    const validate = ajv.compile(ctx.toolDef.parameters);
    const valid = validate(args);
    if (valid === false) {
      throw new AssistantVisibleError(
        ctx.options.formatValidationError(validate.errors ?? [], ctx)
      );
    }
  }
}

function defaultValidateFormatter(errors: ErrorObject[]) {
  return ajv.errorsText(errors, { dataVar: "arguments" });
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
