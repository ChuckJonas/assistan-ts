import { expect, test, beforeEach } from "bun:test";
import { definition, toPayload } from "../definition";
import { Type } from "..";
import { mocked, reset } from "./__mocks__/openai";
import { OpenAI } from "../types/openai";

const openai = mocked as any as OpenAI;

beforeEach(() => {
  reset();
});

test("test mock", async () => {
  const create = await mocked.beta.assistants.create({ model: "test" });
  const retrieve = await mocked.beta.assistants.retrieve(create.id);
  expect(create).toEqual(retrieve);
});

test("test create", async () => {
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

  const linked = await adderDef.link(openai, {});
  expect(linked.id).not.toBeNull();
  expect(mocked.beta.assistants.create.mock.calls.length).toBe(1);
  expect(mocked.beta.assistants.update.mock.calls.length).toBe(0);
});

test("test update", async () => {
  mocked.beta.assistants.create({
    model: "gpt-4",
    name: "adder",
    instructions: "You are a calculator",
    tools: [],
    metadata: { __key__: "adder" },
  });

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
    file_ids: [],
  });

  const linked = await adderDef.link(openai, {});
  expect(linked.id).not.toBeNull();
  expect(mocked.beta.assistants.update.mock.calls.length).toBe(1);

  // running with same def should not update
  const linked2 = await adderDef.link(openai, {});
  expect(mocked.beta.assistants.update.mock.calls.length).toBe(1);
});
