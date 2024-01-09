import { expect, test, beforeEach } from "bun:test";
import { definition } from "../definition";
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
    files: {
      file_ids: ["123"],
    },
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
  });

  const linked = await adderDef.link(openai, {});
  expect(linked.id).not.toBeNull();
  expect(mocked.beta.assistants.create.mock.calls.length).toBe(1);
  expect(mocked.beta.assistants.update.mock.calls.length).toBe(0);
});

test("test update", async () => {
  await mocked.beta.assistants.create({
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
  });

  expect(mocked.beta.assistants.update.mock.calls.length).toBe(0);
  const linked = await adderDef.link(openai, {});
  expect(linked.id).not.toBeNull();
  expect(mocked.beta.assistants.update.mock.calls.length).toBe(1);

  // running with same def should not update
  await adderDef.link(openai, {
    afterUpdate: (...args) => {
      throw new Error("should not update " + JSON.stringify(args));
    },
  });
  expect(mocked.beta.assistants.update.mock.calls.length).toBe(1);
});

test("test files create", async () => {
  const adderDef = definition({
    key: "adder",
    model: "gpt-4",
    name: "adder",
    instructions: "You are a calculator",
    retrieval: true,
    files: {
      resolve: async () => [
        new File([], "file1.txt", { lastModified: new Date().getTime() }),
        new File([], "file2.txt", { lastModified: new Date().getTime() }),
      ],
    },
  });

  const linked = await adderDef.link(openai, {});

  expect(linked.id).not.toBeNull();
  expect(linked.remote.file_ids.length).toBe(2);
  expect(mocked.beta.assistants.create.mock.calls.length).toBe(1);
  expect(mocked.beta.assistants.update.mock.calls.length).toBe(0);
  expect(mocked.files.create.mock.calls.length).toBe(2);
});

test("test files changed with prune", async () => {
  const file1 = await mocked.files.create({
    purpose: "assistants",
    file: new File(["*"], "file-to-remove.txt", {
      lastModified: new Date().getTime(),
    }),
  });
  const file2 = await mocked.files.create({
    purpose: "assistants",
    file: new File(["*"], "file1.txt", { lastModified: new Date().getTime() }),
  });

  await mocked.beta.assistants.create({
    model: "gpt-4",
    name: "adder",
    instructions: "You are a calculator",
    tools: [],
    metadata: { __key__: "adder" },
    file_ids: [file1.id, file2.id],
  });

  //new def with different file
  const adderDef2 = definition({
    key: "adder",
    model: "gpt-4",
    name: "adder",
    instructions: "You are a calculator",
    retrieval: true,
    files: {
      resolve: async () => [
        new File(["*"], "file1.txt", { lastModified: new Date().getTime() }),
        new File(["*"], "new-file.txt", { lastModified: new Date().getTime() }),
      ],
    },
  });

  const linked = await adderDef2.link(openai, { pruneFiles: true });
  expect(linked.remote.file_ids.length).toBe(2);
  expect(mocked.files.create.mock.calls.length).toBe(3);
  expect(mocked.files.del.mock.calls.length).toBe(1);
});
