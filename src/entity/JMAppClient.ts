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
import { limitPromiseAll, requestWithRetry } from "../utils/Utils";
import { buildHtmlContent } from "../utils/Const";

export class JMAppClient extends JMClientAbstract {
  static APP_VERSION = "1.7.9";
  static APP_TOKEN_SECRET = "18comicAPP";
  static APP_TOKEN_SECRET_2 = "18comicAPPContent";
  static APP_DATA_SECRET = "185Hcomic3PAPP7R";

  static JM_CLIENT_URL = [
    "www.cdnmhwscc.vip",
    "www.cdnblackmyth.club",
    "www.cdnmhws.cc",
    "www.cdnuc.vip",
  ];

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
    console.log(res);

    return this.decodeBase64<IJMUser>(res.data.data, timestamp);
  }

  public async getAlbumById(id: string): Promise<JMAppAlbum> {
    const timestamp = this.getTimeStamp();
    const { token, tokenparam } = this.getTokenAndTokenParam(timestamp);
    const res = await requestWithRetry("https://www.cdnmhws.cc/album", "POST", {
      params: { id },
      headers: { token, tokenparam },
      responseType: "json",
    });
    const album_json = this.decodeBase64<IJMAlbum>(res.data, timestamp);
    const album = JMAppAlbum.fromJson(album_json);
    return album;
  }

  public async getPhotoById(id: string): Promise<JMAppPhoto> {
    const timestamp = this.getTimeStamp();
    const { token, tokenparam } = this.getTokenAndTokenParam(timestamp);
    const res = await requestWithRetry(
      "https://www.cdnmhwscc.vip/chapter",
      "POST",
      { params: { id }, headers: { token, tokenparam }, responseType: "json" }
    );
    console.log(res);

    logger.info(`IJMResponse: ${res}`);
    const photo_json = this.decodeBase64<IJMPhoto>(res.data, timestamp);
    const photo = JMAppPhoto.fromJson(photo_json);
    const images = photo.getImages();
    const image_ids = images.map((image) => image.split(".")[0]);
    photo.setImageNames(image_ids);
    return photo;
  }

  public async downloadByPhoto(photo: JMAppPhoto): Promise<void> {
    const images = photo.getImages();
    const id = photo.getId();
    const path = `${this.root}/photo/${id}/origin`;
    await fs.mkdir(path, { recursive: true });
    await limitPromiseAll(
      images.map((image) => async () => {
        const url = `https://cdn-msp.jmapiproxy1.cc/media/photos/${id}/${image}`;
        const res = await requestWithRetry<ArrayBuffer>(url, "GET", {
          responseType: "arraybuffer",
        });
        await saveImage(res, `${path}/${image}`);
      }),
      5
    );
  }

  public async decodeByPhoto(photo: JMPhotoAbstract): Promise<void> {
    const images = photo.getImages();
    const id = photo.getId();
    photo.generateSplitNumbers(this.scramble_id);
    const splitNumbers = photo.getSplitNumbers();
    await fs.mkdir(`${this.root}/photo/${id}/decoded`, { recursive: true });
    await limitPromiseAll(
      images.map((image, index) => async () => {
        const imagePath = `${this.root}/photo/${id}/origin/${image}`;
        const decodedPath = `${this.root}/photo/${id}/decoded/${image}`;
        const imageBuffer = await fs.readFile(imagePath);
        await decodeImage(imageBuffer, splitNumbers[index], decodedPath);
      }),
      5
    );
  }

  public async photoToPdf(
    photo: JMPhotoAbstract,
    pdfPath: string
  ): Promise<void> {
    const images = photo.getImages();
    const id = photo.getId();
    // 打开一个新页面
    const page = await puppeteer.browser.newPage();
    const base64Images = await Promise.all(
      images.map(async (image) => {
        const path = `${this.root}/photo/${id}/decoded/${image}`;
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
  }

  public async photoToZip(
    photo: JMPhotoAbstract,
    zipPath: string,
    password?: string,
    level: number = 6
  ): Promise<void> {
    const id = photo.getId();
    const directory = `${this.root}/photo/${id}/decoded`;
    await archiverImage(
      [{ directory, destpath: false }],
      zipPath,
      password,
      level
    );
    logger.info(`${zipPath} 生成完成`);
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
  public async requestScrambleId(id: string) {
    const timestamp = this.getTimeStamp();
    const { token, tokenparam } = this.getTokenAndTokenParam(
      timestamp,
      JMAppClient.APP_TOKEN_SECRET_2
    );
    const html = await requestWithRetry<string>(
      "https://www.cdnmhws.cc/chapter_view_template",
      "POST",
      { params: { id }, headers: { token, tokenparam }, responseType: "text" }
    );
    this.scramble_id = parseInt(html.match(JM_SCRAMBLE_ID)[1]);
    console.log(this.scramble_id);
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

    // console.log("移除填充后的数据:", dataWithoutPadding);
    // console.log(dataWithoutPadding.toString("utf-8"));
    // 5. 转换为 UTF-8 字符串并解析 JSON
    return JSON.parse(decodedString);
  }
}
