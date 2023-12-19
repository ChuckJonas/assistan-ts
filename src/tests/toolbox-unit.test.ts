import { expect, test } from "bun:test";
import { definition } from "../definition";
import { Type } from "..";
import { AssistantVisibleError, initToolBox } from "../toolbox";
import assert from "assert";
import { RequiredActionFunctionToolCall } from "openai/resources/beta/threads/runs/runs";

const adderDef = definition({
  key: "adder",
  model: "gpt-4",
  name: "adder",
  instructions: "Answer questions about the weather",
  functionTools: {
    sum: {
      parameters: Type.Object({
        a: Type.Number(),
        b: Type.Number(Type.Number()),
      }),
    },
  },
});

function sumToolCall(args: string): RequiredActionFunctionToolCall {
  return {
    id: "123",
    type: "function",
    function: {
      arguments: args,
      name: "sum",
    },
  };
}

const onePlusTwo = sumToolCall(`{"a": 1, "b": 2}`);

/* happy :) */

test("valid", async () => {
  const toolbox = initToolBox(adderDef, {
    sum: async ({ a, b }) => {
      return a + b;
    },
  });

  const result = await toolbox.handleAction(onePlusTwo);
  expect(result.output).toBe("3");
});

/* error handling */

test("missing args", async () => {
  const toolbox = initToolBox(adderDef, {
    sum: async ({ a, b }) => {
      return a + b;
    },
  });

  const output = await toolbox.handleAction(sumToolCall(`{"a": 2}`));
  expect(output.output).toBe(
    "Error calling sum: arguments must have required property 'b'"
  );
});

test("invalid arg type", async () => {
  const toolbox = initToolBox(adderDef, {
    sum: async ({ a, b }) => {
      return a + b;
    },
  });

  const output = await toolbox.handleAction(
    sumToolCall(`{"a": 2, "b": "foo"}`)
  );
  expect(output.output).toContain("arguments/b");
});

test("tool throws fatal error", async () => {
  const toolbox = initToolBox(adderDef, {
    sum: async ({ a, b }) => {
      throw new Error("foo");
    },
  });

  try {
    await toolbox.handleAction(onePlusTwo);
    assert.fail("should have thrown");
  } catch (e: any) {
    expect(e.message).toContain("foo");
  }
});

test("tool throws visible error", async () => {
  const toolbox = initToolBox(adderDef, {
    sum: async ({ a, b }) => {
      throw new AssistantVisibleError("foo");
    },
  });

  const output = await toolbox.handleAction(onePlusTwo);
  expect(output.output).toBe("Error calling sum: foo");
});

/* overrides */

test("override formatOutput", async () => {
  const toolbox = initToolBox(
    adderDef,
    {
      sum: async ({ a, b }) => a + b,
    },
    {
      formatOutput: (output, ctx) => {
        return `${ctx.action.function.name} == ${output}`;
      },
    }
  );

  const output = await toolbox.handleAction(onePlusTwo);
  expect(output.output).toBe("sum == 3");
});

test("override formatToolError", async () => {
  const toolbox = initToolBox(
    adderDef,
    {
      sum: async ({ a, b }) => {
        throw new Error("foo");
      },
    },
    {
      formatToolError: (error: any, ctx) => {
        return `Error calling ${ctx.action.function.name}: ${error.message}`;
      },
    }
  );

  const output = await toolbox.handleAction(onePlusTwo);
  expect(output.output).toBe("Error calling sum: foo");
});
