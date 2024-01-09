import { FileLike } from "openai/uploads";
import {
  toPayload,
  METADATA_KEY,
  AssistantDefinition,
  FunctionTool,
} from "./definition";
import { groupBy } from "./lib/utils";
import { Assistant, AssistantCreateParams, OpenAI } from "./types/openai";
import { Value } from "@sinclair/typebox/value";

export interface LinkedDefinition<T extends Record<string, FunctionTool>>
  extends AssistantDefinition<T> {
  openai: OpenAI;
  id: string;
  remote: Assistant;
}

export type LinkOptions = {
  /** pass a OpenAI id to retrieve by id instead of `metadata-->__key__` search */
  assistantId?: string;
  /** Will create assistant if not found. Default: `true` */
  allowCreate?: boolean;
  /** Run after creating assistant */
  afterCreate?: (assistant: Assistant) => void;

  /** What to do if drift is detected.  Default: `update` */
  updateMode?: "update" | "throw" | "skip";
  /** Runs before updating an assistant. Return false to skip update */
  beforeUpdate?: (
    diff: string[],
    local: AssistantCreateParams,
    remote: Assistant
  ) => boolean;

  /** Runs after updating an assistant */
  afterUpdate?: (assistant: Assistant) => void;

  /* What to do with files.  Only applies if file resolver is set in definition.  Default: `update` */
  fileMode?: "update" | "throw" | "skip";
  /** Deletes files that are no longer linked to the assistant after syncing */
  pruneFiles?: boolean;
};

export const link =
  <T extends Record<string, FunctionTool>>(
    definition: AssistantDefinition<T>
  ) =>
  async (
    openai: OpenAI,
    options: LinkOptions
  ): Promise<LinkedDefinition<T>> => {
    const {
      assistantId,
      allowCreate = true,
      updateMode = "update",
      afterCreate,
      afterUpdate,
      beforeUpdate = () => true,
      fileMode = "update",
      pruneFiles = false,
    } = options;
    const local = toPayload(definition);
    let remote: Assistant | undefined;

    if (assistantId) {
      remote = await openai.beta.assistants.retrieve(assistantId);
    } else {
      const assistants = await openai.beta.assistants.list({ limit: 100 });
      remote = assistants.data.find(
        (assistant) =>
          (assistant.metadata as any)?.[METADATA_KEY] === definition.key
      );
    }

    if (remote) {
      let toUpdate: Partial<AssistantCreateParams> | null = null;
      // handle update
      if (updateMode !== "skip") {
        const differences = findDifferences(remote, local);

        if (differences.length > 0) {
          if (
            updateMode === "update" &&
            beforeUpdate(differences, local, remote)
          ) {
            toUpdate = local;
          } else {
            throw new Error(
              `Assistant with key ${definition.key} is out of sync with remote.  To automatically update, set 'updateMode' to 'update'`
            );
          }
        }
      }

      let file_ids: string[] | null = null;
      if (definition.files?.resolve && fileMode !== "skip") {
        const { matchedFiles, filesToPrune, filesToUpload } =
          await compareFiles(openai, remote, definition);
        if (fileMode === "throw" && filesToUpload.length > 0) {
          throw new Error(
            `The following files are not uploaded to the assistant: ${filesToUpload
              .map((it) => it.name)
              .join(
                ", "
              )}. Set 'fileMode' to 'update' to automatically upload files.`
          );
        }

        if (pruneFiles && filesToPrune.length > 0) {
          await Promise.all(filesToPrune.map((it) => openai.files.del(it.id)));
        }

        // upload
        const uploaded = await Promise.all(
          filesToUpload.map((file) => {
            return openai.files.create({ file, purpose: "assistants" });
          })
        );

        file_ids = [
          ...(definition.files.file_ids ?? []),
          ...uploaded.map((it) => it.id),
          ...matchedFiles.map((it) => it.id),
        ];
      }

      if (toUpdate || file_ids) {
        //update the assistant.
        // Note: In testing, this seems to use "json patch" style updates where it only changes explicitly set fields
        remote = await openai.beta.assistants.update(remote.id, {
          ...(toUpdate ?? {}),
          file_ids: file_ids ?? undefined,
        });
        afterUpdate?.(remote);
      }
    }

    //create the assistant
    if (!remote && allowCreate) {
      // upload files if a resolver is set
      const file_ids = definition.files?.file_ids ?? [];
      if (fileMode != "skip" && definition.files?.resolve) {
        const resolvedFiles = await definition.files.resolve();
        const uploaded = await Promise.all(
          resolvedFiles.map((file) =>
            openai.files.create({ file, purpose: "assistants" })
          )
        );
        file_ids.push(...uploaded.map((it) => it.id));
      }

      remote = await openai.beta.assistants.create({
        ...local,
        file_ids: file_ids,
      });

      afterCreate?.(remote);
    }

    if (!remote) {
      throw new Error();
    }

    return {
      ...definition,
      openai,
      id: remote.id,
      remote,
    };
  };

const findDifferences = (
  remote: Assistant,
  local: Assistant | AssistantCreateParams
): string[] => {
  const comparisons: Record<string, boolean> = {
    name: remote.name === local.name,
    // description: remote.description === local.description,
    instructions: remote.instructions === local.instructions,
    model: remote.model === local.model,
    tools: compareTools(remote.tools, local.tools),
  };

  return Object.keys(comparisons).filter((key) => !comparisons[key]);
};

const compareTools = (
  remote?: Assistant["tools"],
  local?: Assistant["tools"]
) => {
  remote?.sort();
  local?.sort();
  return Value.Hash(remote) === Value.Hash(local);
};

const compareFiles = async (
  openai: OpenAI,
  remote: OpenAI.Beta.Assistants.Assistant,
  definition: AssistantDefinition<any>
) => {
  const resolvedFiles = await definition.files!.resolve!();

  const remoteFiles = await Promise.all(
    remote.file_ids.map((fId) => openai.files.retrieve(fId))
  );

  const getResolvedKey =
    definition.files!.keyFns?.resolved ?? ((it) => it.name);
  const getRemoteKey =
    definition.files!.keyFns?.remote ?? ((it) => it.filename);

  const resolvedByKey: Record<string, FileLike> = groupBy(
    resolvedFiles,
    getResolvedKey
  );
  const remoteByKey: Record<string, OpenAI.Files.FileObject> = groupBy(
    remoteFiles,
    getRemoteKey
  );

  const matches: string[] = [];

  const notMatchedResolved: Set<string> = new Set(Object.keys(resolvedByKey));
  const notMatchedRemote: Set<string> = new Set(Object.keys(remoteByKey));

  for (const key in resolvedByKey) {
    if (notMatchedRemote.has(key)) {
      matches.push(key);
      notMatchedResolved.delete(key);
      notMatchedRemote.delete(key);
    }
  }

  return {
    matchedFiles: matches.map((it) => remoteByKey[it]),
    filesToPrune: Array.from(notMatchedRemote).map((key) => remoteByKey[key]),
    filesToUpload: Array.from(notMatchedResolved).map(
      (key) => resolvedByKey[key]
    ),
  };
};
