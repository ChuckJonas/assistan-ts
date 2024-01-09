import OpenAI from "openai";
import {
  definition,
  assistant,
  Type,
  AssistantVisibleError,
} from "assistan-ts";
import employee_dir from "./employee-dir.json";
import employee_av from "./employee-av.json";
import { AgentCLI } from "../_lib/agentCLI";
import { toFile } from "openai/uploads";
import { readFile, readdir } from "fs/promises";
import { join } from "path";

const openai = new OpenAI({
  apiKey: process.env["OAI_KEY"],
});

let cli: AgentCLI;

(async () => {
  const def = definition({
    key: "Schedul-O-Bot-3000", // 'unique' key added to metadata for linking
    model: "gpt-4-1106-preview",
    name: "Schedul-O-Bot-3000",
    instructions: "You help schedule meetings for E-Corp.",
    codeInterpreter: true,
    functionTools: {
      employee_directory: {
        description: "List all employees with contact and role information",
        parameters: Type.Void(),
      },
      employee_availability: {
        description: "List all employees with contact and role information",
        parameters: Type.Object({
          employee_id: Type.String({
            description: "The Employee Id to schedule the meeting with",
          }),
        }),
      },
      schedule_meeting: {
        description: "Schedule a meeting with an employee",
        parameters: Type.Object({
          employee_ids: Type.Array(
            Type.String({
              description: "The Employee Ids to schedule the meeting with",
            })
          ),
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
    retrieval: true,
    files: {
      // get all Files for current directory
      resolve: async () => {
        const docsDir = join(__dirname, "docs");
        // Read the directory for .md files
        const files = await readdir(docsDir);
        const mdFiles = files.filter((file) => file.endsWith(".md"));
        return Promise.all(
          mdFiles.map(async (filename) => {
            const content = await readFile(join(docsDir, filename));
            return toFile(content, filename);
          })
        );
      },
    },
  });

  const linked = await def.link(openai, {
    allowCreate: true,
    updateMode: "update",
    afterCreate: (assistant) => console.log("assistant created", assistant.id),
    beforeUpdate: (changes) => {
      console.log("Drift Detected on the following fields:", changes);
      return true;
    },
    afterUpdate: (assistant) => console.log("assistant updated", assistant.id),
  });

  const scheduleBot = assistant({
    definition: linked,
    tools: {
      employee_directory: async () => {
        return employee_dir;
      },
      employee_availability: async ({ employee_id }) => {
        if (employee_id in employee_av) {
          return (employee_av as any)[employee_id];
        }
        throw new AssistantVisibleError(
          `Unable to retrieve availability from Employee Id: ${employee_id}`
        );
      },
      schedule_meeting: async ({ employee_ids, date, duration }) => {
        return { success: true, link: "http://example.com/meeting/12345" };
      },
    },
  });

  cli = new AgentCLI(scheduleBot, {
    intro: "You are chatting with Schedul-O-Bot-3000.  How can I assist you?",
    confirmToolRuns: ["schedule_meeting"],
  });
  await cli.start();
})()
  .then(console.log)
  .catch(console.error)
  .finally(() => cli?.close());
