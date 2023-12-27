import { Type, assistant, definition } from "assistan-ts";
import OpenAI from "openai";
import { AgentCLI } from "../_lib/agentCLI";
import { Client } from "pg";
import dotenv from "dotenv";
dotenv.config({ path: __dirname + "/.env" });

const openai = new OpenAI({
  apiKey: process.env["OAI_KEY"],
});

let cli: AgentCLI;
const client = new Client();
(async () => {
  await client.connect();

  const def = definition({
    key: "pg-bot", // 'unique' key added to metadata for linking
    model: "gpt-4",
    name: "pg-bot",
    instructions:
      "Your job is to help a user interact with a postgres database",
    codeInterpreter: true,
    functionTools: {
      get_table_fields: {
        description: "Get the fields schema for a table",
        parameters: Type.Object({
          table: Type.String({
            description: "Name of the table",
          }),
        }),
      },
      execute_query: {
        description: "Execute a query against the database",
        parameters: Type.Object({
          query: Type.String({
            description:
              "The query to execute. Don't forget to qualify your table names with the schema name",
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
      get_table_fields: async ({ table }) => {
        const res = await client.query(
          `SELECT c.column_name, c.data_type, 
          kcu.table_name AS foreign_table, 
          kcu.column_name AS foreign_column
          FROM INFORMATION_SCHEMA.COLUMNS c 
          LEFT JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu 
          ON (c.table_name = kcu.table_name AND c.column_name = kcu.column_name) 
          LEFT JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc 
          ON (kcu.constraint_name = rc.constraint_name) 
          WHERE c.table_name = $1`,
          [table]
        );
        const fields = res.rows.map(
          ({ column_name, data_type, foreign_table, foreign_column }) => ({
            column_name,
            data_type,
            foreign_table: foreign_table ? foreign_table : undefined,
            foreign_column: foreign_column ? foreign_column : undefined,
          })
        );
        return fields;
      },
      execute_query: async ({ query }) => {
        const res = await client.query(query);
        return res.rows;
      },
    },
    toolOptions: {
      // catch all tool error
      formatToolError: (e: any) => {
        console.log(e.message);
        return `ERROR: ${(e as Error).message}`;
      },
    },
  });

  const tables = (
    await client.query(
      `SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';`
    )
  ).rows;

  const bySchema = tables.reduce((acc, t) => {
    if (!acc[t.table_schema]) {
      acc[t.table_schema] = [];
    }
    acc[t.table_schema].push(t.table_name);
    return acc;
  }, {});

  cli = new AgentCLI(scheduleBot, {
    intro: "You are chatting with pg-bot.  How can I assist you?",
    confirmToolRuns: ["execute_query"],
    beforeCreateRun: () => ({
      additional_instructions: `Database Schemas:\n${JSON.stringify(bySchema)}`,
    }),
  });

  await cli.start();
})()
  .then(console.log)
  .catch(console.error)
  .finally(() => {
    cli?.close();
    return client.end();
  });
