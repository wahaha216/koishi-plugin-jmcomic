import { Context, h, HTTP, Schema } from "koishi";
import { Photo } from "./entity/Photo";
import path from "path";
import * as fs from "fs/promises";
import { decodeImage, archiverImage, saveImage } from "./utils/Image";
import {} from "koishi-plugin-puppeteer";
import { Album } from "./entity/Album";
import { buildHtmlContent } from "./utils/Const";
import { fileExistsAsync, getDomainFromGithub } from "./utils/Utils";

export const name = "jmcomic";

export interface Config {
  url?: string;
  sendMethod?: "zip" | "pdf";
  retryCount?: number;
  password?: string;
  debug?: boolean;
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    url: Schema.string().required(),
    retryCount: Schema.number().min(1).max(5).default(5),
    sendMethod: Schema.union(["zip", "pdf"]).default("pdf"),
  }),
  Schema.union([
    Schema.object({
      sendMethod: Schema.const("zip").required(),
      password: Schema.string(),
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

export async function apply(ctx: Context, config: Config) {
  http = ctx.http;

  ctx.i18n.define("en-US", require("./locales/en-US"));
  ctx.i18n.define("zh-CN", require("./locales/zh-CN"));

  const logger = ctx.logger("jmcomic");

  const root = path.join(ctx.baseDir, "data", "jmcomic");

  ctx.command("jm <jmId:number>").action(async ({ session }, jmId) => {
    const messageId = session.messageId;
    if (!jmId) {
      await session.send([h.quote(messageId), h.text(session.text(".empty"))]);
      return;
    }
    let url = config.url.replace(/http(s?):\/\//, "");
    if (url.substring(url.length - 1) === "/") {
      url = url.substring(0, url.length - 1);
    }
    url = `https://${url}/album/${jmId}`;

    const html = await ctx.http.get<string>(url);

    if (html.includes("This album cannot be found.")) {
      await session.send([
        h.quote(messageId),
        h.text(session.text(".notFound")),
      ]);
      return;
    }

    await session.send([
      h.quote(messageId),
      h.text(session.text(".pleaseWait")),
    ]);

    const album = new Album(html);
    const name = album.getName();

    // 创建存储目录
    const path = `${root}/album/${jmId}`;
    await fs.mkdir(path, { recursive: true });
    const episodes = album.getEpisodes();

    /**
     * 根据photoId下载图片
     * @param id photoId
     * @param multipart 是否多章节，默认否
     */
    const downloadImage = async (id: number, multipart: boolean = false) => {
      const sufix = multipart ? `/${id}` : "";

      const url = `https://${config.url}/photo/${id}`;
      const photo_html = await ctx.http.get<string>(url);
      const photo = new Photo(photo_html);
      album.addPhoto(photo);
      const urls = photo.getPhotoUrls();
      const nums = photo.getSplitNumbers();
      const ids = photo.getPhotoIds();

      for (let i = 0; i < urls.length; i++) {
        if (config.debug) logger.info(urls[i]);
        await fs.mkdir(`${path}/origin${sufix}`, { recursive: true });
        await fs.mkdir(`${path}/decoded${sufix}`, { recursive: true });
        const originPath = `${path}/origin${sufix}/${ids[i]}.png`;
        const decodedPath = `${path}/decoded${sufix}/${ids[i]}.png`;
        // 原图存在则直接读取
        if (config.debug) {
          logger.info(`原图${fileExistsAsync(originPath) ? "" : "不"}存在`);
        }
        if (fileExistsAsync(originPath)) {
          // 解密过的图片不存在则进行解密
          if (config.debug) {
            logger.info(
              `解密后的图片${fileExistsAsync(decodedPath) ? "" : "不"}存在`
            );
          }
          if (!fileExistsAsync(decodedPath)) {
            // 解密并保存图片
            const imageBuffer = await fs.readFile(originPath);
            await decodeImage(imageBuffer, nums[i], decodedPath);
          }
        }
        // 如果原图不存在则下载
        else {
          let res: ArrayBuffer = new ArrayBuffer(0);
          let index = 0;
          while (res.byteLength <= 0 && index < config.retryCount) {
            res = await ctx.http.get(`${urls[i]}`, {
              responseType: "arraybuffer",
            });
            index++;
          }
          if (res.byteLength <= 0) {
            logger.error("下载失败");
            await session.send([h.text("网络异常，请稍后再试")]);
            return;
          }
          logger.info(res.byteLength);
          // 保存原图
          await saveImage(res, originPath);
          // 解密过的图片不存在则进行解密
          if (config.debug) {
            logger.info(
              `解密后的图片${fileExistsAsync(decodedPath) ? "" : "不"}存在`
            );
          }
          if (!fileExistsAsync(decodedPath)) {
            // 解密并保存图片
            await decodeImage(res, nums[i], decodedPath);
          }
        }
      }
    };

    /**
     * 生成PDF
     * @param pdfPath pdf路径
     * @param imagePaths 图片路径列表
     */
    const buildPdf = async (pdfPath: string, imagePaths: string[]) => {
      // 打开一个新页面
      const page = await ctx.puppeteer.browser.newPage();
      const base64Images = await Promise.all(
        imagePaths.map(async (path) => {
          const buffer = await fs.readFile(path); // 读取文件为 Buffer
          return `data:image/png;base64,${buffer.toString("base64")}`; // 转换为 base64
        })
      );
      const html = buildHtmlContent(base64Images);
      await page.setContent(html, { waitUntil: "load" });
      // 生成 PDF
      await page.pdf({
        path: pdfPath,
        format: "A4",
        printBackground: true,
      });
      // 关闭页面
      await page.close();
    };

    /**
     * 根据配置生成压缩包或PDF
     * @param multipart 是否多章节，默认否
     */
    const buildZipOrPdf = async (multipart: boolean = false) => {
      // 如果要生成压缩包
      if (config.sendMethod === "zip") {
        const zipPath = `${path}/${jmId}.zip`;
        if (config.debug) {
          logger.info(
            `${jmId}.zip ${fileExistsAsync(zipPath) ? "" : "不"}存在`
          );
        }
        // 不存在文件，生成zip
        if (!fileExistsAsync(zipPath)) {
          // 多章节
          if (multipart) {
            await archiverImage(
              episodes.map((episode) => ({
                directory: `${path}/decoded/${episode.photoId}`,
                destpath: episode.name,
              })),
              zipPath,
              config.password
            );
          }
          // 单章节
          else {
            await archiverImage(
              [{ directory: `${path}/decoded`, destpath: false }],
              zipPath,
              config.password
            );
          }
        }
      }
      // PDF
      else {
        // 多章节
        if (multipart) {
          const photos = album.getPhotos();
          for (const [index, photo] of photos.entries()) {
            const pdfPath = `${path}/${jmId}_${index + 1}.pdf`;
            if (config.debug) {
              logger.info(
                `${jmId}_${index + 1}.pdf ${
                  fileExistsAsync(pdfPath) ? "" : "不"
                }存在`
              );
            }
            // 不存在文件，生成pdf
            if (!fileExistsAsync(pdfPath)) {
              const pngList = photo
                .getPhotoIds()
                .map((id) => `${path}/decoded/${photo.getId()}/${id}.png`);
              await buildPdf(pdfPath, pngList);
            }
          }
        }
        // 单章节
        else {
          const pdfPath = `${path}/${jmId}.pdf`;
          if (config.debug) {
            logger.info(
              `${jmId}.pdf ${fileExistsAsync(pdfPath) ? "" : "不"}存在`
            );
          }
          // 不存在文件，生成pdf
          if (!fileExistsAsync(pdfPath)) {
            const photo = album.getPhotos()[0];
            await buildPdf(
              pdfPath,
              photo.getPhotoIds().map((id) => `${path}/decoded/${id}.png`)
            );
          }
        }
      }
    };

    // 多章节
    if (episodes.length) {
      for (const { photoId } of episodes) {
        await downloadImage(photoId, true);
      }
      await buildZipOrPdf(true);
      if (config.sendMethod === "zip") {
        const buffer = await fs.readFile(`${path}/${jmId}.zip`);
        session.send([
          h.file(buffer, "zip", { title: `${name}(${jmId}).zip` }),
        ]);
      } else {
        for (let i = 0; i < episodes.length; i++) {
          const buffer = await fs.readFile(`${path}/${jmId}_${i + 1}.pdf`);
          await session.send([
            h.file(buffer, "pdf", { title: `${name}(${jmId})_${i + 1}.pdf` }),
          ]);
        }
      }
    }
    // 单章节
    else {
      await downloadImage(jmId);
      await buildZipOrPdf();
      const sufix = config.sendMethod === "zip" ? "zip" : "pdf";
      const buffer = await fs.readFile(`${path}/${jmId}.${sufix}`);
      await session.send([
        h.file(buffer, sufix, { title: `${name}(${jmId}).${sufix}` }),
      ]);
    }
  });
}
