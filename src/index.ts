import { Context, h, Session, Schema } from "koishi";
import { join } from "path";
import { deleteFewDaysAgoFolders } from "./utils/Utils";
import { JMAppClient } from "./entity/JMAppClient";
import { AlbumNotExistError, MySqlError } from "./error";
import { createJmProcessor } from "./processors/jmProcessor";
import { Queue } from "./utils/Queue";
import {} from "@koishijs/plugin-notifier";
import {} from "koishi-plugin-cron";
import {} from "koishi-plugin-puppeteer";
import { readFile } from "fs/promises";

export const name = "jmcomic";

export interface Config {
  listeningJMId?: boolean;
  sendMethod?: "zip" | "pdf";
  fileMethod?: "buffer" | "file";
  retryCount?: number;
  password?: string;
  fileName?: string;
  concurrentDownloadLimit?: number;
  concurrentDecodeLimit?: number;
  concurrentQueueLimit?: number;
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
    fileMethod: Schema.union(["buffer", "file"]).default("buffer"),
    password: Schema.string(),
    fileName: Schema.string().default("{{name}} ({{id}})_{{index}}"),
    sendMethod: Schema.union(["zip", "pdf"]).default("pdf"),
  }),
  Schema.union([
    Schema.object({
      sendMethod: Schema.const("zip").required(),
      level: Schema.number().min(0).max(9).default(6).role("slider"),
    }),
    Schema.object({}),
  ]),
  Schema.object({
    listeningJMId: Schema.boolean().default(false),
  }),
  Schema.object({
    retryCount: Schema.number().min(1).max(5).default(5),
    concurrentDownloadLimit: Schema.number().min(0).max(20).default(10),
    concurrentDecodeLimit: Schema.number().min(0).max(20).default(5),
    concurrentQueueLimit: Schema.number().min(0).max(10).default(1),
  }),
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
  required: ["http", "puppeteer"],
  optional: ["notifier", "cron"],
};

export async function apply(ctx: Context, config: Config) {
  // i18n
  ctx.i18n.define("en-US", require("./locales/en-US"));
  ctx.i18n.define("zh-CN", require("./locales/zh-CN"));

  const logger = ctx.logger("jmcomic");

  const root = join(ctx.baseDir, "data", "jmcomic");

  const scheduleFn = async () => {
    const albumPath = join(ctx.baseDir, "data", "jmcomic", "album");
    await deleteFewDaysAgoFolders(albumPath, config.keepDays);
    const photoPath = join(ctx.baseDir, "data", "jmcomic", "photo");
    await deleteFewDaysAgoFolders(photoPath, config.keepDays);
  };

  // 如果启用了cron服务，并启用了自动删除
  if (config.autoDelete && ctx.cron) {
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

  const processorConfig = {
    root,
    sendMethod: config.sendMethod,
    password: config.password,
    level: config.level,
    fileName: config.fileName,
    fileMethod: config.fileMethod,
    cache: config.cache,
    debug: config.debug || false,
  };

  // 使用导入的 createJmProcessor 函数来创建处理器实例
  const jmProcessor = createJmProcessor(
    processorConfig,
    ctx.http,
    config,
    logger,
    ctx.puppeteer
  );

  // 初始化一个队列实例，处理所有 JM 相关的下载任务
  const queue = new Queue(
    jmProcessor,
    { concurrency: config.concurrentQueueLimit || 1 },
    config,
    logger
  );

  const handleAlbumOrPhoto = async (
    session: Session,
    id: string,
    type: "album" | "photo"
  ) => {
    const messageId = session.messageId;
    if (!/^\d+$/.test(id)) {
      await session.send([
        h.quote(messageId),
        h.text("输入的ID不合法，请检查"),
      ]);
      return;
    }
    // 添加任务到队列
    const { task, pendingAhead, queuePosition } = queue.add({
      type,
      id,
      session,
      messageId,
      scope: session.scope,
    });
    const params = {
      id,
      ahead: pendingAhead,
      pos: queuePosition,
      status: task.status,
    };
    const msg: h.Fragment = [h.quote(messageId)];
    if (pendingAhead === 0 && queuePosition === 1) {
      msg.push(h.text(session.text(".queueFirst", params)));
    } else if (pendingAhead > 0) {
      msg.push(h.text(session.text(".queuePosition", params)));
    } else {
      msg.push(h.text(session.text(".queueProcessing", params)));
    }
    await session.send(msg);
  };

  ctx
    .command("jm.album <albumId:string>")
    .alias("本子")
    .action(async ({ session, options }, albumId) => {
      await handleAlbumOrPhoto(session, albumId, "album");
    });

  ctx
    .command("jm.photo <photoId:string>")
    .alias("本子章节")
    .action(async ({ session }, photoId) => {
      await handleAlbumOrPhoto(session, photoId, "photo");
    });

  ctx
    .command("jm.blog <blogId:string>")
    .alias("JM文库")
    .action(async ({ session }, blogId) => {
      const messageId = session.messageId;
      if (!/^\d+$/.test(blogId)) {
        await session.send([
          h.quote(messageId),
          h.text("输入的ID不合法，请检查"),
        ]);
        return;
      }
      // 添加任务到队列
      const { task, pendingAhead, queuePosition } = queue.add({
        type: "blog",
        id: blogId,
        session,
        messageId,
        scope: session.scope,
      });
      const params = {
        id: blogId,
        ahead: pendingAhead,
        pos: queuePosition,
        status: task.status,
      };
      const msg: h.Fragment = [h.quote(messageId)];
      if (pendingAhead === 0 && queuePosition === 1) {
        msg.push(h.text(session.text(".queueFirst", params)));
      } else if (pendingAhead > 0) {
        msg.push(h.text(session.text(".queuePosition", params)));
      } else {
        msg.push(h.text(session.text(".queueProcessing", params)));
      }
      await session.send(msg);
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
        const jmClient = new JMAppClient(
          root,
          ctx.http,
          config,
          logger,
          ctx.puppeteer
        );
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
        if (error instanceof AlbumNotExistError) {
          await session.send([
            h.quote(messageId),
            h.text(session.text(".notExistError")),
          ]);
        } else if (error instanceof MySqlError) {
          await session.send([
            h.quote(messageId),
            h.text(session.text(".mysqlError")),
          ]);
        } else {
          throw new Error(error);
        }
      }
    });

  ctx
    .command("jm.search <keyword:string>")
    .alias("本子搜索")
    .option("page", "-p <page:number>", { fallback: 1 })
    .option("limit", "-l <limit:number>", { fallback: 10 })
    .action(async ({ session, options }, keyword) => {
      const messageId = session.messageId;
      if (!keyword) {
        await session.send([
          h.quote(messageId),
          h.text(session.text(".emptyKeywordError")),
        ]);
        return;
      }
      try {
        const jmClient = new JMAppClient(
          root,
          ctx.http,
          config,
          logger,
          ctx.puppeteer
        );
        const searchResult = await jmClient.search(keyword);
        const contents = searchResult.content;
        const fragment: h.Fragment = [h.quote(messageId)];
        // 计算起始和结束索引
        const page = options.page > 0 ? options.page : 1;
        const pageSize = options.limit > 0 ? options.limit : 10;
        const startIndex = (page - 1) * pageSize;
        const endIndex = page * pageSize;
        contents.slice(startIndex, endIndex).forEach((content) => {
          fragment.push(`${session.text(".id")}: ${content.id}\n`);
          fragment.push(`${session.text(".name")}: ${content.name}\n`);
          fragment.push(`${session.text(".author")}: ${content.author}\n`);
          fragment.push(
            `${session.text(".category")}: ${content.category.title}\n`
          );
          fragment.push(
            `${session.text(".description")}: ${content.description}\n\n`
          );
        });
        fragment.push(
          session.text(".pagination", {
            total: contents.length,
            page,
            pageSize,
          })
        );
        await session.send(fragment);
      } catch (error) {
        if (error instanceof AlbumNotExistError) {
          await session.send([
            h.quote(messageId),
            h.text(session.text(".notExistError")),
          ]);
        } else if (error instanceof MySqlError) {
          await session.send([
            h.quote(messageId),
            h.text(session.text(".mysqlError")),
          ]);
        } else {
          throw new Error(error);
        }
      }
    });

  ctx
    .command("jm.queue")
    .alias("本子队列")
    .action(async ({ session, options }) => {
      const messageId = session.messageId;
      // 所有任务
      const allTasks = queue.getAllTasks();
      // 过滤状态不是完成的任务
      const pendingOrProcessingTasks = allTasks.filter(
        (task) => task.status !== "completed"
      );
      if (pendingOrProcessingTasks.length === 0) {
        await session.send([
          h.quote(messageId),
          h.text(session.text(".emptyQueue")),
        ]);
        return;
      }

      // 状态转义
      const statusMap: Record<string, string> = {
        pending: session.text(".task.pending"),
        processing: session.text(".task.processing"),
        failed: session.text(".task.failed"),
      };
      // 类型转义
      const typeMap: Record<string, string> = {
        album: session.text(".type.album"),
        photo: session.text(".type.photo"),
      };
      const taskInfos = pendingOrProcessingTasks.map((task) => {
        return h.text(
          session.text(".msgFormat", {
            id: task.payload.id,
            type: typeMap[task.payload.type],
            status: statusMap[task.status],
          })
        );
      });
      await session.send([h.quote(messageId), ...taskInfos]);
    });

  if (config.listeningJMId) {
    ctx.on("message", async (session) => {
      const text = session.content;
      const regexp = /JM\d+/gi;
      const numbers = text.match(regexp);
      if (!numbers?.length) return;
      const id = numbers[0];
      const jmClient = new JMAppClient(
        root,
        ctx.http,
        config,
        logger,
        ctx.puppeteer
      );
      const album = await jmClient.getAlbumById(id.replace(/JM/i, ""));
      const imagePath = await jmClient.downloadFirstImageByAlbum(album);
      const messageId = session.messageId;
      const imageBuffer = await readFile(imagePath);
      session.send([h.quote(messageId), h.image(imageBuffer, "webp")]);
    });
  }
}
