import { writeFile } from "fs/promises";
import OpenAI from "openai";
import { join } from "path";

export const parseAnnotationsFromThread = (
  messages: OpenAI.Beta.Threads.Messages.ThreadMessagesPage
) => {
  const flatMessages = messages.data.flatMap((msg) => msg.content);
  const annotations = flatMessages
    .filter(
      (content): content is OpenAI.Beta.Threads.Messages.MessageContentText =>
        content.type === "text"
    )
    .map((content) => content.text.annotations)
    .flatMap((it) => it)
    .filter(
      (it): it is OpenAI.Beta.Threads.MessageContentText.Text.FilePath =>
        it.type === "file_path"
    );
  return annotations;
};

export const parseImagesFromThread = (
  messages: OpenAI.Beta.Threads.Messages.ThreadMessagesPage
) => {
  const flatMessages = messages.data.flatMap((msg) => msg.content);
  const files = flatMessages
    .filter(
      (
        content
      ): content is OpenAI.Beta.Threads.Messages.MessageContentImageFile =>
        content.type === "image_file"
    )
    .map((content) => content.image_file);
  return files;
};

export const downloadFile = async (
  openai: OpenAI,
  fileId: string,
  basePath: string,
  fileName?: string
) => {
  const fileContent = await openai.files.content(fileId);
  if (!fileName) {
    fileName = getFileNameFromContentDisposition(
      fileContent.headers.get("content-disposition")!
    );
  }

  const bufferView = new Uint8Array(await fileContent.arrayBuffer());
  const path = join(basePath, fileName);
  await writeFile(join(basePath, fileName), bufferView);
  return { fileId, path };
};

export const getFileNameFromContentDisposition = (
  contentDisposition: string
) => {
  let filename = "";
  if (contentDisposition) {
    const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
    let matches = filenameRegex.exec(contentDisposition);
    if (matches != null && matches[1]) {
      filename = matches[1].replace(/['"]/g, "");
    }
  }
  return filename;
};
