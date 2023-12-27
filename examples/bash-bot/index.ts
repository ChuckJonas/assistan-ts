import {
  AssistantVisibleError,
  Type,
  assistant,
  definition,
} from "assistan-ts";

import fs from "fs";
import OpenAI from "openai";
import { AgentCLI } from "../_lib/agentCLI";
import { exec__unsafe } from "../_lib/exec";

const openai = new OpenAI({
  apiKey: process.env["OAI_KEY"],
});

let cli: AgentCLI;

/**
 * WARNING: This is a bad idea :) Probably want to run this one on a VM
 */
(async () => {
  const def = definition({
    key: "bash-bot", // 'unique' key added to metadata for linking
    model: "gpt-4",
    name: "bash-bot",
    instructions: `You are an expert providing command line instructions of osx shell.  Your current path is ${process.cwd()}`,
    codeInterpreter: true,
    functionTools: {
      run_bash_command: {
        description: "Run a unix command",
        parameters: Type.Object({
          cmd: Type.String({
            description: "The command to run",
          }),
        }),
      },
      loadFileForAnalysis: {
        description: "loads a selected file for analysis",
        parameters: Type.Object({
          file_path: Type.String({
            description: "The path to the file",
          }),
        }),
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
      run_bash_command: async ({ cmd }) => {
        // spawn a process and wait for it to finish
        try {
          const result = await exec__unsafe(cmd);
          return {
            output: result,
          };
        } catch (e: any) {
          throw new AssistantVisibleError(e.message);
        }
      },
      loadFileForAnalysis: async ({ file_path }) => {
        //read file stream
        const file = await openai.files.create({
          file: fs.createReadStream(file_path),
          purpose: "assistants",
        });
        cli.queueMessage({
          role: "user",
          content: `File loaded: ${file_path}`,
          file_ids: [file.id],
        });

        return "File Uploading. Ask user what they'd like to do with it";
      },
    },
  });

  cli = new AgentCLI(scheduleBot, {
    intro: "hope you know what you're doing :)",
    confirmToolRuns: true,
    threadId: process.argv[2], // pass threadID in to pickup on an old thread
    outputPath: "./",
  });

  await cli.start();
})()
  .then(console.log)
  .catch(console.error)
  .finally(() => cli?.close());
