import assert from "assert";
import { expect, test } from "bun:test";
import { RequiredActionFunctionToolCall } from "openai/resources/beta/threads/runs/runs";
import { Type } from "..";
import { AssistantVisibleError, initToolBox } from "../toolbox";

const sumDef = {
  sum: {
    parameters: Type.Object({
      a: Type.Number(),
      b: Type.Number(Type.Number()),
    }),
  },
};

const noopDef = {
  noop: {
    parameters: Type.Null(),
  },
};

const dateDef = {
  dateFn: {
    parameters: Type.Object({
      d: Type.String({
        format: "date",
      }),
    }),
  },
};

function toolCall(tool: string, args: string): RequiredActionFunctionToolCall {
  return {
    id: "123",
    type: "function",
    function: {
      arguments: args,
      name: tool,
    },
  };
}

const sumToolCall = (args: string) => toolCall("sum", args);

const onePlusTwo = sumToolCall(`{"a": 1, "b": 2}`);

test("valid", async () => {
  const toolbox = initToolBox(sumDef, {
    sum: async ({ a, b }) => {
      return a + b;
    },
  });

  const result = await toolbox.handleAction(onePlusTwo);
  expect(result.output).toBe("3");
});

test("no parameters", async () => {
  const toolbox = initToolBox(noopDef, {
    noop: async () => {
      return "success";
    },
  });

  const result = await toolbox.handleAction(toolCall("noop", "{}"));
  expect(result.output).toBe("success");
});

/* error handling */

test("missing args", async () => {
  const toolbox = initToolBox(sumDef, {
    sum: async ({ a, b }) => {
      return a + b;
    },
  });

  const output = await toolbox.handleAction(sumToolCall(`{"a": 2}`));
  expect(output.output).toContain("arguments/b");
});

test("invalid arg type", async () => {
  const toolbox = initToolBox(sumDef, {
    sum: async ({ a, b }) => {
      return a + b;
    },
  });

  const output = await toolbox.handleAction(
    sumToolCall(`{"a": 2, "b": "foo"}`)
  );
  expect(output.output).toContain("arguments/b");
});

test("valid format type", async () => {
  const toolbox = initToolBox(dateDef, {
    dateFn: async ({ d }) => {
      return "success";
    },
  });

  const output = await toolbox.handleAction(
    toolCall("dateFn", `{"d": "2022-03-14"}`)
  );
  expect(output.output).toBe("success");
});

test("invalid format type", async () => {
  const toolbox = initToolBox(dateDef, {
    dateFn: async ({ d }) => {
      return d;
    },
  });

  const output = await toolbox.handleAction(
    toolCall("dateFn", `{"d": "22/03/14"}`)
  );
  expect(output.output).toContain("arguments/d");
});

test("tool throws fatal error", async () => {
  const toolbox = initToolBox(sumDef, {
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
  const toolbox = initToolBox(sumDef, {
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
    sumDef,
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
    sumDef,
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
