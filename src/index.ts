import { Context, h, HTTP, Logger, Schema } from "koishi";
import { join } from "path";
import { readFile, rm } from "fs/promises";
import { deleteFewDaysAgoFolders, getFileInfo } from "./utils/Utils";
import { JMAppClient } from "./entity/JMAppClient";
import {} from "@koishijs/plugin-notifier";
import {} from "koishi-plugin-cron";

export const name = "jmcomic";

export interface Config {
  // url?: string;
  sendMethod?: "zip" | "pdf";
  retryCount?: number;
  password?: string;
  fileName?: string;
  level?: number;
  cache?: boolean;
  autoDelete?: boolean;
  deleteInStart?: boolean;
  keepDays?: number;
  cron?: string;
  debug?: boolean;
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    // url: Schema.string().required().default("18comic-mygo.vip"),
    retryCount: Schema.number().min(1).max(5).default(5),
    sendMethod: Schema.union(["zip", "pdf"]).default("pdf"),
    password: Schema.string(),
    fileName: Schema.string().default("{{name}} ({{id}}){{index}}"),
  }),
  Schema.union([
    Schema.object({
      sendMethod: Schema.const("zip").required(),
      level: Schema.number().min(0).max(9).default(6).role("slider"),
    }),
    Schema.object({}),
  ]),
  Schema.object({
    cache: Schema.boolean().default(false),
  }),
  Schema.union([
    Schema.object({
      cache: Schema.const(true).required(),
      autoDelete: Schema.boolean().default(false),
    }),
    Schema.object({}),
  ]),
  Schema.union([
    Schema.object({
      cache: Schema.const(true).required(),
      autoDelete: Schema.const(true).required(),
      cron: Schema.string().default("0 0 * * *"),
      deleteInStart: Schema.boolean().default(false),
      keepDays: Schema.number().min(1).default(7),
    }),
    Schema.object({}),
  ]),
  Schema.object({
    debug: Schema.boolean().default(false),
  }),
]).i18n({
  "zh-CN": require("./locales/zh-CN")._config,
  "en-US": require("./locales/en-US")._config,
});

export const inject = {
  required: ["http"],
  optional: ["notifier", "cron"],
};

export let http: HTTP;
export let logger: Logger;
export let retryCount: number;
export let debug: boolean;

export async function apply(ctx: Context, config: Config) {
  http = ctx.http;
  retryCount = config.retryCount;
  debug = config.debug;

  // i18n
  ctx.i18n.define("en-US", require("./locales/en-US"));
  ctx.i18n.define("zh-CN", require("./locales/zh-CN"));

  logger = ctx.logger("jmcomic");

  const root = join(ctx.baseDir, "data", "jmcomic");

  const scheduleFn = async () => {
    const albumPath = join(ctx.baseDir, "data", "jmcomic", "album");
    await deleteFewDaysAgoFolders(albumPath, config.keepDays);
    const photoPath = join(ctx.baseDir, "data", "jmcomic", "photo");
    await deleteFewDaysAgoFolders(photoPath, config.keepDays);
  };

  // 如果启用了cron服务
  if (ctx.cron) {
    ctx.cron(config.cron, scheduleFn);
  }

  // 启动时检查并删除符合条件的缓存图片
  if (config.autoDelete && config.deleteInStart) scheduleFn();

  if (ctx.notifier) {
    ctx.notifier.create({
      type: "warning",
      content:
        "据JMComic-Crawler-Python源码可知JM图片还有gif形式，目前尚未支持",
    });
  }

  const formatFileName = (name: string, id: string, index?: number) => {
    return config.fileName
      .replaceAll("{{name}}", name)
      .replaceAll("{{id}}", id)
      .replaceAll("{{index}}", index ? `_${index}` : "");
  };

  ctx
    .command("jm.album <albumId:string>")
    .alias("本子")
    .action(async ({ session, options }, albumId) => {
      const messageId = session.messageId;
      if (!/^\d+$/.test(albumId)) {
        await session.send([
          h.quote(messageId),
          h.text("输入的ID不合法，请检查"),
        ]);
        return;
      }
      try {
        const jmClient = new JMAppClient(root);
        const album = await jmClient.getAlbumById(albumId);
        await jmClient.downloadByAlbum(album);
        let filePath: string | string[];
        if (config.sendMethod === "zip") {
          filePath = await jmClient.albumToZip(
            album,
            config.password,
            config.level
          );
        } else {
          filePath = await jmClient.albumToPdf(album, config.password);
        }
        // 返回的路径是字符串
        if (typeof filePath === "string") {
          const buffer = await readFile(filePath);
          const { fileName, ext, dir } = getFileInfo(filePath);
          const name = formatFileName(fileName, albumId);
          if (debug) logger.info(`文件名：${name}.${ext}`);
          await session.send([
            h.file(buffer, ext, { title: `${name}.${ext}` }),
          ]);
          // 未开启缓存则直接删除
          if (!config.cache) rm(dir, { recursive: true });
        }
        // 返回的路径是字符串数组
        else {
          let fileDir: string;
          for (const [index, p] of filePath.entries()) {
            const buffer = await readFile(p);
            const { fileName, ext, dir } = getFileInfo(p);
            const name = formatFileName(fileName, albumId, index + 1);
            if (debug) logger.info(`文件名：${name}.${ext}`);
            await session.send([
              h.file(buffer, ext, { title: `${name}.${ext}` }),
            ]);
            fileDir = dir;
          }
          // 未开启缓存则直接删除
          if (!config.cache) rm(fileDir, { recursive: true });
        }
      } catch (error) {
        if (error instanceof Error) {
          if (error.message.includes("Could not connect to mysql")) {
            await session.send([
              h.quote(messageId),
              h.text("已尝试所有可能，但是JM坏掉了"),
            ]);
          }
        } else {
          throw new Error(error);
        }
      }
    });

  ctx
    .command("jm.photo <photoId:string>")
    .alias("本子章节")
    .action(async ({ session }, photoId) => {
      const messageId = session.messageId;
      if (!/^\d+$/.test(photoId)) {
        await session.send([
          h.quote(messageId),
          h.text("输入的ID不合法，请检查"),
        ]);
        return;
      }
      try {
        const jmClient = new JMAppClient(root);
        const photo = await jmClient.getPhotoById(photoId);
        await jmClient.downloadByPhoto(photo);
        const photoName = photo.getName();
        let filePath: string;
        if (config.sendMethod === "zip") {
          filePath = await jmClient.photoToZip(
            photo,
            photoName,
            config.password,
            config.level
          );
        } else {
          filePath = await jmClient.photoToPdf(photo, photoName);
        }
        const buffer = await readFile(filePath);
        const { fileName, ext, dir } = getFileInfo(filePath);
        const name = formatFileName(fileName, photoId);
        if (debug) logger.info(`文件名：${filePath}`);
        if (debug) logger.info(`文件名：${name}.${ext}`);
        await session.send([
          h.file(buffer, ext, { title: `${name} (${photoId}).${ext}` }),
        ]);
        // 未开启缓存则直接删除
        if (!config.cache) rm(dir, { recursive: true });
      } catch (error) {
        if (error instanceof Error) {
          if (error.message.includes("Could not connect to mysql")) {
            await session.send([
              h.quote(messageId),
              h.text("已尝试所有可能，但是JM坏掉了"),
            ]);
          }
        } else {
          throw new Error(error);
        }
      }
    });

  ctx
    .command("jm.album.info <albumId:string>")
    .alias("本子信息")
    .action(async ({ session, options }, albumId) => {
      const messageId = session.messageId;
      if (!/^\d+$/.test(albumId)) {
        await session.send([
          h.quote(messageId),
          h.text("输入的ID不合法，请检查"),
        ]);
        return;
      }
      try {
        const jmClient = new JMAppClient(root);
        const album = await jmClient.getAlbumById(albumId);
        await session.send([
          h.quote(messageId),
          h.text(`ID：${album.getId()}\n`),
          h.text(`名称：${album.getName()}\n`),
          h.text(`章节数：${album.getPhotos().length}\n`),
          h.text(`作者：${album.getAuthors()?.join("、") ?? ""}\n`),
          h.text(`登场人物：${album.getActors()?.join("、") ?? ""}\n`),
          h.text(`点赞数：${album.getLikes()}\n`),
          h.text(`观看数：${album.getTotalViews()}`),
        ]);
      } catch (error) {
        if (error instanceof Error) {
          if (error.message.includes("Could not connect to mysql")) {
            await session.send([
              h.quote(messageId),
              h.text("已尝试所有可能，但是JM坏掉了"),
            ]);
          }
        } else {
          throw new Error(error);
        }
      }
    });
}
