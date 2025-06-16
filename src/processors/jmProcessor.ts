import { Config } from "..";
import { h, Logger, Session, HTTP } from "koishi";
import { readFile, rm } from "node:fs/promises";
import { JMAppClient } from "../entity/JMAppClient";
import { formatFileName, getFileInfo } from "../utils/Utils";
import { AlbumNotExistError, MySqlError, PhotoNotExistError } from "../error";

// 定义通用的任务负载类型
export type JmTaskPayload = {
  type: "album" | "photo";
  id: string; // albumId 或 photoId
  session: Session;
  messageId: string;
};

// 定义处理器需要的配置类型，与之前相同
interface ProcessorConfig {
  root: string;
  sendMethod: "zip" | "pdf";
  password?: string;
  level?: number;
  fileName: string;
  fileMethod: "buffer" | "file";
  cache: boolean;
  debug: boolean;
}

// 导出创建处理器函数
export const createJmProcessor = (
  processorConfig: ProcessorConfig,
  http: HTTP,
  config: Config,
  logger: Logger
) => {
  const {
    root,
    sendMethod,
    password,
    level,
    fileName,
    fileMethod,
    cache,
    debug,
  } = processorConfig;

  return async (payload: JmTaskPayload): Promise<void> => {
    const { id, session, messageId } = payload; // id 现在是通用字段

    try {
      const jmClient = new JMAppClient(root, http, config, logger);
      let filePath: string | string[];
      let name: string;
      let ext: string;
      let dir: string = ""; // 初始化 dir

      if (payload.type === "album") {
        const album = await jmClient.getAlbumById(id);
        await jmClient.downloadByAlbum(album);

        if (sendMethod === "zip") {
          filePath = await jmClient.albumToZip(album, password, level);
        } else {
          filePath = await jmClient.albumToPdf(album, password);
        }

        // 处理返回的路径（字符串或数组）
        if (typeof filePath === "string") {
          const fileInfo = getFileInfo(filePath);
          name = formatFileName(fileName, fileInfo.fileName, id);
          ext = fileInfo.ext;
          dir = fileInfo.dir;
        } else {
          // 字符串数组
          // 统一处理多文件的情况，这里只取第一个文件的信息作为基准，或者你可以根据需求调整
          const firstPath = filePath[0];
          const fileInfo = getFileInfo(firstPath);
          name = formatFileName(fileName, fileInfo.fileName, id); // 名称可能需要进一步处理以反映多部分
          ext = fileInfo.ext; // 扩展名
          dir = fileInfo.dir; // 目录
        }
      } else if (payload.type === "photo") {
        const photo = await jmClient.getPhotoById(id);
        await jmClient.downloadByPhoto(photo);
        const photoName = photo.getName(); // 获取章节名称

        if (sendMethod === "zip") {
          filePath = await jmClient.photoToZip(
            photo,
            photoName,
            password,
            level
          );
        } else {
          filePath = await jmClient.photoToPdf(photo, photoName);
        }

        const fileInfo = getFileInfo(filePath as string); // photoToZip/Pdf 返回单字符串
        name = formatFileName(fileName, fileInfo.fileName, id);
        ext = fileInfo.ext;
        dir = fileInfo.dir;
      } else {
        // 理论上不会走到这里，但为了类型安全和健壮性，可以抛出错误
        throw new Error(`未知任务类型: ${(payload as any).type}`);
      }

      // --- 统一发送文件逻辑 ---
      if (typeof filePath === "string") {
        const {
          fileName: baseFileName,
          ext: fileExt,
          dir: fileDir,
        } = getFileInfo(filePath);
        const finalName = formatFileName(fileName, baseFileName, id); // 使用 id
        if (debug) logger.info(`文件名：${finalName}.${fileExt}`);
        if (fileMethod === "buffer") {
          const buffer = await readFile(filePath);
          await session.send([
            h.file(buffer, fileExt, { title: `${finalName}.${fileExt}` }),
          ]);
        } else {
          await session.send([
            h.file(`file:///${filePath}`, { title: `${finalName}.${fileExt}` }),
          ]);
        }
        if (!cache) rm(fileDir, { recursive: true });
      } else {
        // string[]
        let currentFileDir: string = "";
        for (const [index, p] of filePath.entries()) {
          const {
            fileName: baseFileName,
            ext: fileExt,
            dir: fileDir,
          } = getFileInfo(p);
          const finalName = formatFileName(
            fileName,
            baseFileName,
            id,
            index + 1
          );
          if (debug) logger.info(`文件名：${finalName}.${fileExt}`);
          if (fileMethod === "buffer") {
            const buffer = await readFile(p);
            await session.send([
              h.file(buffer, fileExt, { title: `${finalName}.${fileExt}` }),
            ]);
          } else {
            await session.send([
              h.file(`file:///${p}`, { title: `${finalName}.${fileExt}` }),
            ]);
          }
          currentFileDir = fileDir;
        }
        if (!cache) {
          if (currentFileDir) {
            rm(currentFileDir, { recursive: true });
          } else {
            logger.warn(`无法删除目录，fileDir 未定义。任务 ID: ${id}`);
          }
        }
      }
    } catch (error) {
      // 统一错误处理，根据错误类型发送不同消息
      if (
        error instanceof AlbumNotExistError ||
        error instanceof PhotoNotExistError
      ) {
        await session.send([
          h.quote(messageId),
          h.text(session.text(".notExistError")), // 假设 .notExistError 可以通用
        ]);
      } else if (error instanceof MySqlError) {
        await session.send([
          h.quote(messageId),
          h.text(session.text(".mysqlError")),
        ]);
      } else {
        logger.error(`处理任务 ID: ${id} 时发生未知错误:`, error);
        await session.send([
          h.quote(messageId),
          h.text(`处理 ID 为 ${id} 的本子/章节时发生错误`),
          h.text(error instanceof Error ? error.message : String(error)),
        ]);
        throw error; // 重新抛出以便队列捕获并标记失败
      }
    }
  };
};
