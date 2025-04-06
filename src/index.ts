import { Context, h, HTTP, Logger, Schema } from "koishi";
import path from "path";
import * as fs from "fs/promises";
import Puppeteer from "koishi-plugin-puppeteer";
import { getFileNameAndExt } from "./utils/Utils";
import cron from "node-cron";
import { JMAppClient } from "./entity/JMAppClient";

export const name = "jmcomic";

export interface Config {
  url?: string;
  sendMethod?: "zip" | "pdf";
  retryCount?: number;
  password?: string;
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
    url: Schema.string().required().default("18comic-mygo.vip"),
    retryCount: Schema.number().min(1).max(5).default(5),
    sendMethod: Schema.union(["zip", "pdf"]).default("pdf"),
  }),
  Schema.union([
    Schema.object({
      sendMethod: Schema.const("zip").required(),
      password: Schema.string(),
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
      autoDelete: Schema.const(true).required(),
      cron: Schema.string().required().default("0 0 * * *"),
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
  required: ["puppeteer", "http"],
};

export let http: HTTP;
export let logger: Logger;
export let puppeteer: Puppeteer;
export let retryCount: number;

export async function apply(ctx: Context, config: Config) {
  http = ctx.http;
  puppeteer = ctx.puppeteer;
  retryCount = config.retryCount;

  // i18n
  ctx.i18n.define("en-US", require("./locales/en-US"));
  ctx.i18n.define("zh-CN", require("./locales/zh-CN"));

  logger = ctx.logger("jmcomic");

  const root = path.join(ctx.baseDir, "data", "jmcomic");

  if (cron.validate(config.cron)) {
    cron.schedule(config.cron, async () => {
      const root = path.join(ctx.baseDir, "data", "jmcomic", "album");
      // 读取目录内容，并获取文件/文件夹的详细信息
      const dirEntries = await fs.readdir(root, {
        withFileTypes: true,
      });
      // 过滤出文件夹类型的条目
      const subfolderNames = dirEntries
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name);
      // 循环判断所有文件夹
      for (const folder of subfolderNames) {
        // 获取文件夹状态信息
        const stat = await fs.stat(`${root}/${folder}`);
        // 提取创建时间
        const creationTime = stat.birthtime || stat.ctime;
        // 当前时间
        const now = new Date();
        // 计算时间差（毫秒）
        const diffTime = Math.abs(now.getTime() - creationTime.getTime());
        // 转换为天数并取整
        const diffDays = Math.floor(diffTime / (1000 * 3600 * 24));
        if (diffDays >= config.keepDays) {
          fs.rmdir(`${root}/${folder}`, { recursive: true });
        }
      }
    });
  }

  // ctx.command("jm <jmId:string>").action(async ({ session }, jmId) => {
  //   const messageId = session.messageId;
  //   // id不能为空
  //   if (!jmId) {
  //     await session.send([h.quote(messageId), h.text(session.text(".empty"))]);
  //     return;
  //   }
  //   // 输入是否合法
  //   else if (!JM_ID.exec(jmId)) {
  //     await session.send([h.quote(messageId), h.text(session.text(".empty"))]);
  //     return;
  //   }
  //   let url = config.url.replace(/http(s?):\/\//, "");
  //   if (url.substring(url.length - 1) === "/") {
  //     url = url.substring(0, url.length - 1);
  //   }
  //   url = `https://${url}/album/${jmId}`;

  //   if (config.debug) logger.info(url);
  //   const html = await ctx.http.get<string>(url);

  //   if (html.includes("This album cannot be found.")) {
  //     await session.send([
  //       h.quote(messageId),
  //       h.text(session.text(".notFound")),
  //     ]);
  //     return;
  //   }

  //   await session.send([
  //     h.quote(messageId),
  //     h.text(session.text(".pleaseWait")),
  //   ]);

  //   const album = new Album(html);
  //   const name = album.getName();

  //   // 创建存储目录
  //   const path = `${root}/album/${jmId}`;
  //   await fs.mkdir(path, { recursive: true });
  //   const episodes = album.getEpisodes();

  //   /**
  //    * 根据photoId下载图片
  //    * @param id photoId
  //    * @param multipart 是否多章节，默认否
  //    */
  //   const downloadImage = async (id: string, multipart: boolean = false) => {
  //     const sufix = multipart ? `/${id}` : "";

  //     const url = `https://${config.url}/photo/${id}`;
  //     const photo_html = await ctx.http.get<string>(url);
  //     const photo = new Photo(photo_html);
  //     album.addPhoto(photo);
  //     const urls = photo.getPhotoUrls();
  //     const nums = photo.getSplitNumbers();
  //     const ids = photo.getPhotoIds();

  //     for (let i = 0; i < urls.length; i++) {
  //       if (config.debug) logger.info(urls[i]);
  //       await fs.mkdir(`${path}/origin${sufix}`, { recursive: true });
  //       await fs.mkdir(`${path}/decoded${sufix}`, { recursive: true });
  //       const originPath = `${path}/origin${sufix}/${ids[i]}.png`;
  //       const decodedPath = `${path}/decoded${sufix}/${ids[i]}.png`;
  //       // 原图存在则直接读取
  //       if (config.debug) {
  //         logger.info(`原图${fileExistsAsync(originPath) ? "" : "不"}存在`);
  //       }
  //       if (fileExistsAsync(originPath)) {
  //         // 解密过的图片不存在则进行解密
  //         if (config.debug) {
  //           logger.info(
  //             `解密后的图片${fileExistsAsync(decodedPath) ? "" : "不"}存在`
  //           );
  //         }
  //         if (!fileExistsAsync(decodedPath)) {
  //           // 解密并保存图片
  //           const imageBuffer = await fs.readFile(originPath);
  //           await decodeImage(imageBuffer, nums[i], decodedPath);
  //         }
  //       }
  //       // 如果原图不存在则下载
  //       else {
  //         let res: ArrayBuffer = new ArrayBuffer(0);
  //         let index = 0;
  //         while (res.byteLength <= 0 && index < config.retryCount) {
  //           res = await ctx.http.get(`${urls[i]}`, {
  //             responseType: "arraybuffer",
  //           });
  //           index++;
  //         }
  //         if (res.byteLength <= 0) {
  //           logger.error("下载失败");
  //           await session.send([h.text("网络异常，请稍后再试")]);
  //           return;
  //         }
  //         logger.info(res.byteLength);
  //         // 保存原图
  //         await saveImage(res, originPath);
  //         // 解密过的图片不存在则进行解密
  //         if (config.debug) {
  //           logger.info(
  //             `解密后的图片${fileExistsAsync(decodedPath) ? "" : "不"}存在`
  //           );
  //         }
  //         if (!fileExistsAsync(decodedPath)) {
  //           // 解密并保存图片
  //           await decodeImage(res, nums[i], decodedPath);
  //         }
  //       }
  //     }
  //   };

  //   /**
  //    * 生成PDF
  //    * @param pdfPath pdf路径
  //    * @param imagePaths 图片路径列表
  //    */
  //   const buildPdf = async (pdfPath: string, imagePaths: string[]) => {
  //     // 打开一个新页面
  //     const page = await ctx.puppeteer.browser.newPage();
  //     const base64Images = await Promise.all(
  //       imagePaths.map(async (path) => {
  //         const buffer = await fs.readFile(path); // 读取文件为 Buffer
  //         return `data:image/png;base64,${buffer.toString("base64")}`; // 转换为 base64
  //       })
  //     );
  //     const html = buildHtmlContent(base64Images);
  //     await page.setContent(html, { waitUntil: "load" });
  //     // 生成 PDF
  //     await page.pdf({
  //       path: pdfPath,
  //       format: "A4",
  //       printBackground: true,
  //     });
  //     // 关闭页面
  //     await page.close();
  //   };

  //   /**
  //    * 根据配置生成压缩包或PDF
  //    * @param multipart 是否多章节，默认否
  //    */
  //   const buildZipOrPdf = async (multipart: boolean = false) => {
  //     // 如果要生成压缩包
  //     if (config.sendMethod === "zip") {
  //       const zipPath = `${path}/${jmId}.zip`;
  //       if (config.debug) {
  //         logger.info(
  //           `${jmId}.zip ${fileExistsAsync(zipPath) ? "" : "不"}存在`
  //         );
  //       }
  //       // 不存在文件，生成zip
  //       if (!fileExistsAsync(zipPath)) {
  //         // 多章节
  //         if (multipart) {
  //           await archiverImage(
  //             episodes.map((episode) => ({
  //               directory: `${path}/decoded/${episode.photoId}`,
  //               destpath: episode.name,
  //             })),
  //             zipPath,
  //             config.password,
  //             config.level
  //           );
  //         }
  //         // 单章节
  //         else {
  //           await archiverImage(
  //             [{ directory: `${path}/decoded`, destpath: false }],
  //             zipPath,
  //             config.password,
  //             config.level
  //           );
  //         }
  //       }
  //     }
  //     // PDF
  //     else {
  //       // 多章节
  //       if (multipart) {
  //         const photos = album.getPhotos();
  //         for (const [index, photo] of photos.entries()) {
  //           const pdfPath = `${path}/${jmId}_${index + 1}.pdf`;
  //           if (config.debug) {
  //             logger.info(
  //               `${jmId}_${index + 1}.pdf ${
  //                 fileExistsAsync(pdfPath) ? "" : "不"
  //               }存在`
  //             );
  //           }
  //           // 不存在文件，生成pdf
  //           if (!fileExistsAsync(pdfPath)) {
  //             const pngList = photo
  //               .getPhotoIds()
  //               .map((id) => `${path}/decoded/${photo.getId()}/${id}.png`);
  //             await buildPdf(pdfPath, pngList);
  //           }
  //         }
  //       }
  //       // 单章节
  //       else {
  //         const pdfPath = `${path}/${jmId}.pdf`;
  //         if (config.debug) {
  //           logger.info(
  //             `${jmId}.pdf ${fileExistsAsync(pdfPath) ? "" : "不"}存在`
  //           );
  //         }
  //         // 不存在文件，生成pdf
  //         if (!fileExistsAsync(pdfPath)) {
  //           const photo = album.getPhotos()[0];
  //           await buildPdf(
  //             pdfPath,
  //             photo.getPhotoIds().map((id) => `${path}/decoded/${id}.png`)
  //           );
  //         }
  //       }
  //     }
  //   };

  //   // 多章节
  //   if (episodes.length) {
  //     for (const { photoId } of episodes) {
  //       await downloadImage(photoId, true);
  //     }
  //     await buildZipOrPdf(true);
  //     if (config.sendMethod === "zip") {
  //       const buffer = await fs.readFile(`${path}/${jmId}.zip`);
  //       session.send([
  //         h.file(buffer, "zip", { title: `${name}(${jmId}).zip` }),
  //       ]);
  //     } else {
  //       for (let i = 0; i < episodes.length; i++) {
  //         const buffer = await fs.readFile(`${path}/${jmId}_${i + 1}.pdf`);
  //         await session.send([
  //           h.file(buffer, "pdf", { title: `${name}(${jmId})_${i + 1}.pdf` }),
  //         ]);
  //       }
  //     }
  //   }
  //   // 单章节
  //   else {
  //     await downloadImage(jmId);
  //     await buildZipOrPdf();
  //     const sufix = config.sendMethod === "zip" ? "zip" : "pdf";
  //     const buffer = await fs.readFile(`${path}/${jmId}.${sufix}`);
  //     await session.send([
  //       h.file(buffer, sufix, { title: `${name}(${jmId}).${sufix}` }),
  //     ]);
  //   }
  //   // 没开缓存则删除文件
  //   if (!config.cache) fs.rmdir(path, { recursive: true });
  // });

  ctx
    .command("jm.album <albumId:string>")
    .alias("本子")
    // .option("pdf", "-p")
    // .option("zip", "-z")
    // .option("password", "-pwd")
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
        // jmClient.login("liyen95079", 'xG_0(G5|*d<|"1(pM$Wz');
        const album = await jmClient.getAlbumById(albumId);
        await jmClient.downloadByAlbum(album);
        let path: string | string[];
        if (config.sendMethod === "zip") {
          path = await jmClient.albumToZip(
            album,
            config.password,
            config.level
          );
        } else {
          path = await jmClient.albumToPdf(album);
        }
        // 返回的路径是字符串
        if (typeof path === "string") {
          const buffer = await fs.readFile(path);
          const { fileName, ext } = getFileNameAndExt(path);
          await session.send([
            h.file(buffer, ext, { title: `${fileName} (${albumId}).${ext}` }),
          ]);
        }
        // 返回的路径是字符串数组
        else {
          for (const p of path) {
            const buffer = await fs.readFile(p);
            const { fileName, ext } = getFileNameAndExt(p);
            await session.send([
              h.file(buffer, ext, { title: `${fileName} (${albumId}).${ext}` }),
            ]);
          }
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
        const name = photo.getName();
        let path: string;
        if (config.sendMethod === "zip") {
          path = await jmClient.photoToZip(
            photo,
            name,
            config.password,
            config.level
          );
        } else {
          path = await jmClient.photoToPdf(photo, name);
        }
        const buffer = await fs.readFile(path);
        const { fileName, ext } = getFileNameAndExt(path);
        await session.send([
          h.file(buffer, ext, { title: `${fileName} (${photoId}).${ext}` }),
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
