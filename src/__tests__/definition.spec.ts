import { expect, test } from "bun:test";
import { definition, toPayload } from "../definition";
import { Type } from "..";

import { RequiredActionFunctionToolCall } from "openai/resources/beta/threads/runs/runs";

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

test("translates to OpenAI schema", async () => {
  const adderDef = definition({
    key: "adder",
    model: "gpt-4",
    name: "adder",
    instructions: "You are a calculator",
    codeInterpreter: true,
    retrieval: true,

    functionTools: {
      sum: {
        parameters: Type.Object({
          a: Type.Number(),
          b: Type.Number(Type.Number()),
        }),
      },
      noop: {
        parameters: Type.Null(),
      },
    },
    metadata: { foo: "value" },
    file_ids: [],
  });

  const oaiDef = toPayload(adderDef);
  expect(oaiDef.tools?.length).toBe(4);
  expect((oaiDef.metadata as any)["foo"]).toBe("value");
  expect(JSON.stringify(oaiDef, null, 2)).toMatchSnapshot();
});
