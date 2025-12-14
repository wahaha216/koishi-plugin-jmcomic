import { Config } from "..";
import { h, Logger, Session, HTTP } from "koishi";
import { readFile, rm } from "node:fs/promises";
import { JMAppClient } from "../entity/JMAppClient";
import { formatFileName, getFileInfo } from "../utils/Utils";
import { AlbumNotExistError, MySqlError, PhotoNotExistError } from "../error";
import Puppeteer from "koishi-plugin-puppeteer";

// 定义通用的任务负载类型
export type JmTaskPayload = {
  type: "album" | "photo" | "blog";
  id: string; // albumId 或 photoId
  session: Session;
  messageId: string;
  scope: string;
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
  logger: Logger,
  puppeteer: Puppeteer
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
    const { id, session, messageId, scope } = payload; // id 现在是通用字段

    try {
      const jmClient = new JMAppClient(root, http, config, logger, puppeteer);
      let filePath: string | string[];

      switch (payload.type) {
        case "album": {
          const album = await jmClient.getAlbumById(id);
          await jmClient.downloadByAlbum(album);

          if (sendMethod === "zip") {
            filePath = await jmClient.albumToZip(album, password, level);
          } else {
            filePath = await jmClient.albumToPdf(album, password);
          }
          break;
        }
        case "photo": {
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
          break;
        }
        case "blog": {
          const blog = await jmClient.getBlogById(id);
          if (sendMethod === "zip") {
            filePath = await jmClient.blogToZip(blog, password, level);
          } else {
            filePath = await jmClient.blogToPdf(blog, password);
          }
          return;
        }
        // 理论上不会走到这里，但为了类型安全和健壮性，可以抛出错误
        default:
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
          h.text(session.text(`${scope}.notExistError`)), // 假设 .notExistError 可以通用
        ]);
      } else if (error instanceof MySqlError) {
        await session.send([
          h.quote(messageId),
          h.text(session.text(`${scope}.mysqlError`)),
        ]);
      } else {
        // logger.error(`处理任务 ID: ${id} 时发生未知错误:`, error);
        await session.send([
          h.quote(messageId),
          h.text(`处理 ID 为 ${id} 的本子/章节时发生错误`),
        ]);
        throw error; // 重新抛出以便队列捕获并标记失败
      }
    }
  };
};
