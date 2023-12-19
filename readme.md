# OpenAI Assistan(ts)

[![build status](https://img.shields.io/github/actions/workflow/status/ChuckJonas/assistan-ts/test.yml?label=CI&logo=github)](https://github.com/ChuckJonas/assistan-ts/actions/workflows/test.yml)
[![npm version](https://img.shields.io/npm/v/assistan-ts.svg)](https://www.npmjs.org/package/assistan-ts)

`npm i assistan-ts`

A lightweight framework for building and running code first, type-safe assistants.  

This library aims to make it easy to manage assistants, without introducing heavy abstractions or opinionated frameworks. 

**Key Features:**

- Define Assistants using [`typebox`](https://github.com/sinclairzx81/typebox) schemas
- sync changes with OpenAI
- Parse & validate arguments to tool calls
- Automatically poll runs for completion

## Usage

### Define your Assistant


```typescript
import { Type, definition, assistant } from 'assistan-ts';

  const def = definition({
    key: "Schedul-O-Bot-3000", // 'unique' key added to metadata for linking
    model: "gpt-4",
    name: "Schedul-O-Bot-3000",
    instructions: "You help schedule meetings for E-Corp.",
    codeInterpreter: true,
    functionTools: {
      employee_directory: {
        description: "List all employees with contact and role information",
        parameters: Type.Void(),
      },
      schedule_meeting: {
        description: "Schedule a meeting with an employee",
        parameters: Type.Object({
          employee: Type.Number({
            description: "The Employee Id to schedule the meeting with",
          }),
          date: Type.String({
            description: "The date to schedule the meeting on",
            format: "date-time",
          }),
          duration: Type.Number({
            description: "The duration of the meeting in minutes",
            minimum: 15,
            maximum: 60 * 3,
          }),
        }),
      },
    },
  });
```

*NOTE: Not all typebox types are supported by OpenAI at this time*

### Link the Assistant to OpenAI

```typescript
const linked = await def.link(openai);
```

This will create the assistant if it doesn't exist, and update it to match the schema if there is any drift.

*WARNING: By default, this will update the assistant to match the schema. If you want to disable this behavior, pass `{ updateMode: "skip" }` to the `link` function.*


### Create an instance of your assistant

For any tools you defined, you must provide an implementation with a matching signature.

```typescript 
  const scheduleBot = assistant({
    definition: linked,
    tools: {
      employee_directory: async () => {
        return [
          {
            id: 1000,
            name: "John Chen",
            email: "ariachen@example.com",
            department: "Marketing",
            role: "Marketing Manager",
          },
          //...
        ];
      },
      schedule_meeting: async ({ employee, date, duration }) => {
        return {
          status: "success",
          meeting_id: "123",
        };
      },
    },
    toolOptions: {
        // override defaults
    }
  });
```

## Create a thread and run

```typescript
const thread = await openai.beta.threads.create({
  messages: [
    {
      role: "user",
      content: "Schedule a 45m meeting with Alana on Tuesday at 3pm",
    },
  ],
});

const { run, complete } = await scheduleBot.run.create({
  threadId: thread.id,
});

const abortCtrl = new AbortController();
await complete({ interval: 1000, abortCtrl });

const messages = await openai.beta.threads.messages.list(thread.id);
```

## Configuration

### Link Options

| Property | Type | Description  |
|----------|:-------------:|------|
| assistantId | string (optional) | Pass a OpenAI id to retrieve by id instead of `metadata-->__key__` search |
| allowCreate | boolean (optional) | Will create assistant if not found. Default: `true` |
| updateMode | "update" or "throw" or "skip" (optional) | What to do if drift is detected. Default: `update` |

#### Tool Options

| Property | Type | Description  |
|----------|:-------------:|------|
| validateArguments | boolean | Run JSONSchema validation before calling tool. default: `true` |
| jsonParser | (args: string, ctx: ToolContext) => unknown | Parse tool call arguments |
| validator | (args: unknown, ctx: ToolContext) => void | Validates parsed arguments |
| formatToolError | (error: unknown, ctx: ToolContext) => string | Formats and remap tool execution errors |
| formatValidationError | (errors: ErrorObject<string, Record<string, any>, unknown>[], ctx: ToolContext) => string | Formats validation error messages |
| formatOutput | (output: Output, ctx: ToolContext) => string | Formats the output of the tool's operation |

