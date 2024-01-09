import { expect, test, beforeEach, mock, jest } from "bun:test";
import { definition } from "../definition";
import { assistant } from "../assistant";
import { Type } from "..";
import { mocked, reset, simulate } from "./__mocks__/openai";
import { OpenAI } from "../types/openai";

const openai = mocked as any as OpenAI;

beforeEach(() => {
  reset();
});

test("create w/ complete run", async () => {
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
    },
    metadata: { foo: "value" },
  });

  const linked = await adderDef.link(openai, {});

  const _assistant = await assistant({
    definition: linked,
    tools: {
      sum: async ({ a, b }) => {
        return a + b;
      },
    },
  });

  const threadId = await openai.beta.threads.create({});

  const { run, complete } = await _assistant.run.create({
    threadId: threadId.id,
  });
  expect(run.status).toBe("queued");

  const { setCompleted } = simulate(run.id);
  setCompleted({
    value: "result",
    annotations: [],
  });
  const onStatus = jest.fn();
  await complete({ interval: 50, onStatusChange: onStatus });
  const messages = await openai.beta.threads.messages.list(threadId.id);
  expect(onStatus.mock.calls.length).toBe(2);
  expect(onStatus.mock.calls[0][1]).toBe("queued");
  expect(onStatus.mock.calls[1][1]).toBe("in_progress");
  expect(onStatus.mock.calls[1][0].status).toBe("completed");
  expect(messages.data.length).toBe(1);
  expect((messages.data[0].content[0] as any).text.value).toBe("result");
});

test("create w/ require action", async () => {
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
    },
    metadata: { foo: "value" },
  });

  const linked = await adderDef.link(openai, {});

  const sumMock = mock(({ a, b }) => {
    // throw new Error("Run already in progress");
    return Promise.resolve(a + b);
  });
  const _assistant = await assistant({
    definition: linked,
    tools: {
      sum: sumMock,
    },
  });

  const threadId = await openai.beta.threads.create({});

  const { run, toolsRequired } = await _assistant.run.create({
    threadId: threadId.id,
  });

  expect(run.status).toBe("queued");
  const { setCompleted, setRequiresAction } = simulate(run.id);

  setRequiresAction([
    {
      id: "1",
      type: "function",
      function: {
        name: "sum",
        arguments: '{"a": 1, "b": 2}',
      },
    },
    {
      id: "2",
      type: "function",
      function: {
        name: "sum",
        arguments: '{"a": 1, "b": 2}',
      },
    },
  ]);

  const onStatus = jest.fn();
  const { toolsRequest } = await toolsRequired({
    interval: 50,
    onStatusChange: onStatus,
  });
  expect(onStatus.mock.calls.length).toBe(2);
  expect(onStatus.mock.calls[0][1]).toBe("queued");
  expect(onStatus.mock.calls[1][1]).toBe("in_progress");
  expect(onStatus.mock.calls[1][0].status).toBe("requires_action");
  expect(toolsRequest?.toolCalls.length).toBe(2);

  setCompleted({
    value: "result",
    annotations: [],
  });

  // override function output
  await toolsRequest?.execute({ "2": "canceled" });
  expect(sumMock.mock.calls.length).toBe(1);
  expect(sumMock.mock.calls[0][0]).toEqual({ a: 1, b: 2 });
  expect(mocked.beta.threads.runs.submitToolOutputs.mock.calls.length).toBe(1);
  expect(
    mocked.beta.threads.runs.submitToolOutputs.mock.calls[0][2].tool_outputs.find(
      (it) => it.tool_call_id === "1"
    )?.output
  ).toEqual("3");
  expect(
    mocked.beta.threads.runs.submitToolOutputs.mock.calls[0][2].tool_outputs.find(
      (it) => it.tool_call_id === "2"
    )?.output
  ).toEqual("canceled");
});
