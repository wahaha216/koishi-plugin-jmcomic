import { logger, puppeteer } from "..";
import crypto from "crypto";
import FormData from "form-data";
import axios from "axios";
import { IJMAlbum, IJMUser, IJMPhoto, IJMResponse } from "../types/JMClient";
import { JM_SCRAMBLE_ID } from "../utils/Regexp";
import { JMClientAbstract } from "../abstract/JMClientAbstract";
import { JMAppPhoto } from "./JMAppPhoto";
import { JMAppAlbum } from "./JMAppAlbum";
import { JMPhotoAbstract } from "../abstract/JMPhotoAbstract";
import * as fs from "fs/promises";
import { archiverImage, decodeImage, saveImage } from "../utils/Image";
import {
  fileExistsAsync,
  fileSizeAsync,
  limitPromiseAll,
  requestWithRetry,
  requestWithUrlSwitch,
  sanitizeFileName,
} from "../utils/Utils";
import { buildHtmlContent } from "../utils/Const";
import { Directorys } from "../types";

export class JMAppClient extends JMClientAbstract {
  static APP_VERSION = "1.7.9";
  static APP_TOKEN_SECRET = "18comicAPP";
  static APP_TOKEN_SECRET_2 = "18comicAPPContent";
  static APP_DATA_SECRET = "185Hcomic3PAPP7R";

  static JM_CLIENT_IMAGE_DOMAIN = [
    "cdn-msp.jmapiproxy1.cc",
    "cdn-msp.jmapiproxy2.cc",
    "cdn-msp2.jmapiproxy2.cc",
    "cdn-msp3.jmapiproxy2.cc",
    "cdn-msp.jmapinodeudzn.net",
    "cdn-msp3.jmapinodeudzn.net",
  ];

  constructor(root: string) {
    super(root);
  }

  // Could not connect to mysql! Please check your database settings!

  async login(username: string, password: string) {
    const timestamp = this.getTimeStamp();
    const { token, tokenparam } = this.getTokenAndTokenParam(timestamp);
    const headers = {
      "Accept-Encoding": "gzip, deflate",
      "User-Agent":
        "Mozilla/5.0 (Linux; Android 9; V1938CT Build/PQ3A.190705.11211812; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/91.0.4472.114 Safari/537.36",
      token,
      tokenparam,
    };
    const formData = new FormData();
    formData.append("username", username);
    formData.append("password", password);

    const res = await axios.post<IJMResponse>(
      "https://www.cdnmhws.cc/login",
      formData,
      { headers, responseType: "json" }
    );
    return this.decodeBase64<IJMUser>(res.data.data, timestamp);
  }

  public async getAlbumById(id: string): Promise<JMAppAlbum> {
    const timestamp = this.getTimeStamp();
    const { token, tokenparam } = this.getTokenAndTokenParam(timestamp);
    const res = await requestWithUrlSwitch("/album", "POST", {
      params: { id },
      headers: { token, tokenparam },
      responseType: "json",
    });
    const album_json = this.decodeBase64<IJMAlbum>(res.data, timestamp);
    const album = JMAppAlbum.fromJson(album_json);
    const series = album.getSeries();
    const photos: JMAppPhoto[] = [];
    if (series.length) {
      for (const s of series) {
        const photo = await this.getPhotoById(s.id);
        photos.push(photo);
      }
    } else {
      const photo = await this.getPhotoById(id);
      photos.push(photo);
    }
    album.setPhotos(photos);
    return album;
  }

  public async getPhotoById(id: string): Promise<JMAppPhoto> {
    const timestamp = this.getTimeStamp();
    const { token, tokenparam } = this.getTokenAndTokenParam(timestamp);
    const res = await requestWithUrlSwitch("/chapter", "POST", {
      params: { id },
      headers: { token, tokenparam },
      responseType: "json",
    });
    const photo_json = this.decodeBase64<IJMPhoto>(res.data, timestamp);
    const photo = JMAppPhoto.fromJson(photo_json);
    const images = photo.getImages();
    const image_ids = images.map((image) => image.split(".")[0]);
    photo.setImageNames(image_ids);
    return photo;
  }

  public async downloadByAlbum(album: JMAppAlbum): Promise<void> {
    // 本子ID
    const id = album.getId();
    // 本子存放路径
    const path = `${this.root}/album/${id}`;
    // 创建文件夹
    await fs.mkdir(path, { recursive: true });
    // const series = album.getSeries();
    // 多章节本子
    // if (series.length > 1) {
    //   for (const s of series) {
    //     const sId = s.id;
    //     const photo = await this.getPhotoById(sId);
    //     await this.downloadByPhoto(photo, "album", id);
    //   }
    // }
    // // 单章节本子
    // else {
    //   const photo = await this.getPhotoById(id);
    //   await this.downloadByPhoto(photo, "album", id);
    // }
    const photos: JMAppPhoto[] = album.getPhotos();
    for (const photo of photos) {
      await this.downloadByPhoto(photo, "album", id, photos.length === 1);
    }
  }

  public async downloadByPhoto(
    photo: JMAppPhoto,
    type: "photo" | "album" = "photo",
    albumId: string = "",
    single: boolean
  ): Promise<void> {
    const images = photo.getImages();
    const id = photo.getId();
    let path = `${this.root}/${type}/${id}/origin`;
    logger.info(`开始下载 ${id}`);
    if (type === "album") {
      if (single) {
        path = `${this.root}/${type}/${albumId}/origin`;
      } else {
        path = `${this.root}/${type}/${albumId}/origin/${id}`;
      }
    }
    await fs.mkdir(path, { recursive: true });
    await limitPromiseAll(
      images
        // 过滤已经下载过的图片
        .filter((image) => {
          const imagePath = `${path}/${image}`;
          const fileExists = fileExistsAsync(imagePath);
          const fileSize = fileSizeAsync(imagePath);
          return !fileExists || !fileSize;
        })
        .map((image) => async () => {
          const url = `https://cdn-msp.jmapiproxy1.cc/media/photos/${id}/${image}`;
          const res = await requestWithRetry<ArrayBuffer>(url, "GET", {
            responseType: "arraybuffer",
          });
          await saveImage(res, `${path}/${image}`);
        }),
      5
    );
    logger.info(`${id} 下载完成，开始解密图片`);
    await this.decodeByPhoto(photo, type, albumId, single);
  }

  public async decodeByPhoto(
    photo: JMPhotoAbstract,
    type: "photo" | "album" = "photo",
    albumId: string = "",
    single: boolean = false
  ): Promise<void> {
    const images = photo.getImages();
    const id = photo.getId();
    const scramble_id = await this.requestScrambleId(id);
    photo.generateSplitNumbers(scramble_id);
    const splitNumbers = photo.getSplitNumbers();

    let path = `${this.root}/${type}/${id}/origin`;
    let decodedPath = `${this.root}/${type}/${id}/decoded`;
    if (type === "album" && !single) {
      path = `${this.root}/${type}/${albumId}/origin/${id}`;
      decodedPath = `${this.root}/${type}/${albumId}/decoded/${id}`;
    }
    await fs.mkdir(path, { recursive: true });
    await fs.mkdir(decodedPath, { recursive: true });
    await limitPromiseAll(
      images
        // 过滤已经解密的图片
        .filter((image) => {
          const imagePath = `${decodedPath}/${image}`;
          const fileExists = fileExistsAsync(imagePath);
          const fileSize = fileSizeAsync(imagePath);
          // logger.info(`${imagePath}`, `${fileExists}, ${fileSize}, ${!fileExists || !fileSize}`);
          return !fileExists || !fileSize;
        })
        .map((image, index) => async () => {
          const imagePath = `${path}/${image}`;
          logger.info(`解密: ${imagePath}`);
          const decodedImagePath = `${decodedPath}/${image}`;
          const imageBuffer = await fs.readFile(imagePath);
          await decodeImage(imageBuffer, splitNumbers[index], decodedImagePath);
        }),
      10
    );
    logger.info(`${id} 解密完成`);
  }

  public async albumToPdf(album: JMAppAlbum): Promise<string | string[]> {
    // 本子ID
    const id = album.getId();
    // const series = album.getSeries();
    // // 多章节本子
    // if (series.length > 1) {
    //   for (const [i, s] of series.entries()) {
    //     const photo = await this.getPhotoById(id);
    //     await this.photoToPdf(
    //       photo,
    //       `${photo.getName()}_${i + 1}`,
    //       "album",
    //       id
    //     );
    //   }
    // }
    // // 单章节本子
    // else {
    //   const photo = await this.getPhotoById(id);
    //   await this.photoToPdf(photo, `${photo.getName()}`, "album", id);
    // }
    const photos = album.getPhotos();
    // 单章节
    if (photos.length === 1) {
      const photo = photos[0];
      return await this.photoToPdf(
        photo,
        `${photo.getName()}`,
        "album",
        id,
        true
      );
    }
    // 多章节
    else {
      let paths: string[] = [];
      for (const [i, photo] of photos.entries()) {
        const path = await this.photoToPdf(
          photo,
          `${photo.getName()}_${i + 1}`,
          "album",
          id,
          false
        );
        paths.push(path);
      }
      return paths;
    }
  }

  public async photoToPdf(
    photo: JMAppPhoto,
    pdfName: string,
    type: "photo" | "album" = "photo",
    albumId: string = "",
    single: boolean = false
  ): Promise<string> {
    const images = photo.getImages();
    const id = photo.getId();
    // 打开一个新页面
    const page = await puppeteer.browser.newPage();
    let path = `${this.root}/${type}/${id}`;
    if (type === "album") {
      path = `${this.root}/${type}/${albumId}`;
    }
    const base64Images = await Promise.all(
      images.map(async (image) => {
        let imagePath = `${path}/decoded/${image}`;
        if (type === "album") {
          if (single) {
            imagePath = `${path}/decoded/${image}`;
          } else {
            imagePath = `${path}/decoded/${id}/${image}`;
          }
        }
        const buffer = await fs.readFile(imagePath); // 读取文件为 Buffer
        return `data:image/png;base64,${buffer.toString("base64")}`; // 转换为 base64
      })
    );
    const html = buildHtmlContent(base64Images);
    await page.setContent(html, { waitUntil: "load" });
    await page.setViewport({
      width: 1920,
      height: 1080,
    });
    // 文件名合法化
    pdfName = sanitizeFileName(pdfName);
    // 生成 PDF
    await page.pdf({
      path: `${path}/${pdfName}.pdf`,
      printBackground: true,
      scale: 0.75,
      preferCSSPageSize: true,
    });
    // 关闭页面
    await page.close();
    logger.info(`${pdfName}.pdf 生成完成`);
    return `${path}/${pdfName}.pdf`;
  }

  public async albumToZip(
    album: JMAppAlbum,
    password?: string,
    level: number = 6
  ): Promise<string> {
    const id = album.getId();
    const series = album.getSeries();
    // 文件名合法化
    const zipName = sanitizeFileName(album.getName());
    const path = `${this.root}/album/${id}`;
    const directorys: Directorys[] = [];
    // 多章节本子
    if (series.length > 1) {
      for (const s of series) {
        directorys.push({
          directory: `${path}/decoded/${s.id}`,
          destpath: `第${s.sort}章`,
        });
      }
    }
    // 单章节本子
    else {
      directorys.push({ directory: `${path}/decoded`, destpath: false });
    }
    await archiverImage(directorys, `${path}/${zipName}.zip`, password, level);
    logger.info(`${zipName}.zip 生成完成`);
    return `${path}/${zipName}.zip`;
  }

  public async photoToZip(
    photo: JMPhotoAbstract,
    zipName: string,
    password?: string,
    level: number = 6
  ): Promise<void> {
    const id = photo.getId();
    // 文件名合法化
    zipName = sanitizeFileName(zipName);
    const path = `${this.root}/photo/${id}`;
    await archiverImage(
      [{ directory: `${path}/decoded`, destpath: false }],
      `${path}/${zipName}.zip`,
      password,
      level
    );
    logger.info(`${zipName}.zip 生成完成`);
  }

  /**
   * 获取时间戳
   * @returns 时间戳
   */
  getTimeStamp() {
    const date = new Date();
    return date.getTime();
  }

  /**
   * 获取Scramble ID
   * @param id JM本子ID
   */
  public async requestScrambleId(id: number) {
    const timestamp = this.getTimeStamp();
    const { token, tokenparam } = this.getTokenAndTokenParam(
      timestamp,
      JMAppClient.APP_TOKEN_SECRET_2
    );
    const html = await requestWithUrlSwitch<string>(
      "/chapter_view_template",
      "POST",
      { params: { id }, headers: { token, tokenparam }, responseType: "text" }
    );
    return parseInt(html.match(JM_SCRAMBLE_ID)[1]);
  }

  /**
   * 获取请求时所需的token和tokenparam
   * @param timestamp 时间戳
   * @param version APP版本
   * @param secret 密钥
   * @returns 请求时所需的token和tokenparam
   */
  private getTokenAndTokenParam(
    timestamp: number,
    secret: string = JMAppClient.APP_TOKEN_SECRET,
    version: string = JMAppClient.APP_VERSION
  ) {
    const key = `${timestamp}${secret}`;
    const token = crypto.createHash("md5").update(key).digest("hex");
    const tokenparam = `${timestamp},${version}`;
    return { token, tokenparam };
  }

  /**
   * 解密加密字符串
   * @param timestamp 请求时传递的时间戳
   * @param base64 待解密的字符串
   * @param secret
   * @returns 解密结果，JSON
   */
  private decodeBase64<T = Record<string, unknown>>(
    base64: string,
    timestamp: number,
    secret: string = JMAppClient.APP_DATA_SECRET
  ): T {
    const dataB64 = Buffer.from(base64, "base64");

    // 计算密钥
    const md5 = this.md5Hex(`${timestamp}${secret}`);

    // 32位key
    const key = Buffer.from(md5);
    // 解密
    const decipher = crypto.createDecipheriv("aes-256-ecb", key, null);
    // decipher.setAutoPadding(false); // 禁用自动填充处理
    let dataAES = decipher.update(dataB64);
    // 拼接全部
    let decrypted = Buffer.concat([dataAES, decipher.final()]);

    const decodedString = decrypted.toString("utf-8");

    // 3. 移除 padding
    // const paddingLength = dataAES[dataAES.length - 1];
    // const dataWithoutPadding = dataAES.slice(0, dataAES.length - paddingLength);

    // 转换为 UTF-8 字符串并解析 JSON
    return JSON.parse(decodedString);
  }
}
