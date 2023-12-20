import OpenAI from "openai";
import {definition, assistant, Type, AssistantVisibleError} from 'assistan-ts';
import employee_dir from './employee-dir.json';
import emplopyee_av from './employee-av.json';

const openai = new OpenAI({
    apiKey: process.env['OAI_KEY'],
});

(async () => {
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
            employee_avaliablity: {
                description: "List all employees with contact and role information",
                parameters: Type.Object({
                    employee_id: Type.String({
                        description: "The Employee Id to schedule the meeting with",
                    })
                })
            },
            schedule_meeting: {
                description: "Schedule a meeting with an employee",
                haltOnRequest: true,
                parameters: Type.Object({
                    employee_ids: Type.Array(Type.String({
                        description: "The Employee Ids to schedule the meeting with",
                    })), 
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

    const linked = await def.link(openai, {
        allowCreate: true,
        updateMode: "update",
    });

    const scheduleBot = assistant({
        definition: linked,
        tools: {
            employee_directory: async () => {
                return employee_dir;
            },
            employee_avaliablity: async ({ employee_id }) => {
                if(employee_id in emplopyee_av){
                    return (emplopyee_av as any)[employee_id];
                }
                throw new AssistantVisibleError(`Unable to retrieve avaliablity from Employee Id: ${employee_id}`)
                
            },
            schedule_meeting: async ({ employee_ids, date, duration }) => {
                console.log('Scheduling Meeting:', employee_ids, date, duration);
                return {success: true, link: 'http://example.com/meeting/12345' }
            }
        },
    });

    const thread = await openai.beta.threads.create({
        messages: [
            {
                role: "user",
                content: "Schedule a 45m meeting with Alana on Tuesday at 3pm",
            },
        ],
    });


    const { run, complete, toolsRequired } = await scheduleBot.run.create({
        threadId: thread.id,
    });


})()
    .then(console.log)
    .catch(console.error);

