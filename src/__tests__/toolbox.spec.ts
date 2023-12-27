import assert from "assert";
import { expect, test } from "bun:test";
import { RequiredActionFunctionToolCall } from "openai/resources/beta/threads/runs/runs";
import { Type } from "..";
import { AssistantVisibleError, filter, toolbox, join } from "../toolbox";

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
  const tb = toolbox(sumDef, {
    sum: async ({ a, b }) => {
      return a + b;
    },
  });

  const result = await tb.handleAction(onePlusTwo);
  expect(result.output).toBe("3");
});

test("no parameters", async () => {
  const tb = toolbox(noopDef, {
    noop: async () => {
      return "success";
    },
  });

  const result = await tb.handleAction(toolCall("noop", "{}"));
  expect(result.output).toBe("success");
});

/* error handling */

test("missing args", async () => {
  const tb = toolbox(sumDef, {
    sum: async ({ a, b }) => {
      return a + b;
    },
  });

  const output = await tb.handleAction(sumToolCall(`{"a": 2}`));
  expect(output.output).toContain("arguments/b");
});

test("invalid arg type", async () => {
  const tb = toolbox(sumDef, {
    sum: async ({ a, b }) => {
      return a + b;
    },
  });

  const output = await tb.handleAction(sumToolCall(`{"a": 2, "b": "foo"}`));
  expect(output.output).toContain("arguments/b");
});

test("valid format type", async () => {
  const tb = toolbox(dateDef, {
    dateFn: async ({ d }) => {
      return "success";
    },
  });

  const output = await tb.handleAction(
    toolCall("dateFn", `{"d": "2022-03-14"}`)
  );
  expect(output.output).toBe("success");
});

test("invalid format type", async () => {
  const tb = toolbox(dateDef, {
    dateFn: async ({ d }) => {
      return d;
    },
  });

  const output = await tb.handleAction(toolCall("dateFn", `{"d": "22/03/14"}`));
  expect(output.output).toContain("arguments/d");
});

test("tool throws fatal error", async () => {
  const tb = toolbox(sumDef, {
    sum: async ({ a, b }) => {
      throw new Error("foo");
    },
  });

  try {
    await tb.handleAction(onePlusTwo);
    assert.fail("should have thrown");
  } catch (e: any) {
    expect(e.message).toContain("foo");
  }
});

test("tool throws visible error", async () => {
  const tb = toolbox(sumDef, {
    sum: async ({ a, b }) => {
      throw new AssistantVisibleError("foo");
    },
  });

  const output = await tb.handleAction(onePlusTwo);
  expect(output.output).toBe("Error calling sum: foo");
});

/* overrides */

test("override formatOutput", async () => {
  const tb = toolbox(
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

  const output = await tb.handleAction(onePlusTwo);
  expect(output.output).toBe("sum == 3");
});

test("override formatToolError", async () => {
  const tb = toolbox(
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

  const output = await tb.handleAction(onePlusTwo);
  expect(output.output).toBe("Error calling sum: foo");
});

test("join toolboxes", async () => {
  const one = toolbox(sumDef, {
    sum: async ({ a, b }) => {
      return a + b;
    },
  });

  const two = toolbox(noopDef, {
    noop: async () => {
      return "success";
    },
  });

  const tb = join(one, two);

  const output = await tb.handleAction(onePlusTwo);
  expect(output.output).toBe("3");

  const output2 = await tb.handleAction(toolCall("noop", "{}"));
  expect(output2.output).toBe("success");
});

test("filter", async () => {
  const tb = toolbox(
    { ...noopDef, ...sumDef },
    {
      noop: async () => {
        return "success";
      },
      sum: async ({ a, b }) => {
        return a + b;
      },
    }
  );

  const filteredTb = filter(tb, (key) => key === "sum");

  expect(Object.keys(filteredTb.toolDefs).length).toBe(1);
  expect(Object.keys(filteredTb.toolsFn).length).toBe(1);
  const output = await filteredTb.handleAction(onePlusTwo);
  expect(output.output).toBe("3");

  const output2 = await filteredTb.handleAction(toolCall("noop", "{}"));
  expect(output2.output).toContain("Error calling noop");
});
