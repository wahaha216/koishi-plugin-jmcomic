import { Config } from "..";
import { Logger, HTTP } from "koishi";
import { createHash, createDecipheriv } from "crypto";
import FormData from "form-data";
import {
  IJMAlbum,
  IJMUser,
  IJMPhoto,
  IJMResponse,
  IJMSearchResult,
} from "../types/JMClient";
import { JM_SCRAMBLE_ID } from "../utils/Regexp";
import { JMClientAbstract } from "../abstract/JMClientAbstract";
import { JMAppPhoto } from "./JMAppPhoto";
import { JMAppAlbum } from "./JMAppAlbum";
import { JMPhotoAbstract } from "../abstract/JMPhotoAbstract";
import { readFile, mkdir, rm } from "fs/promises";
import { archiverImage, decodeImage, saveImage } from "../utils/Image";
import {
  fileExistsAsync,
  fileSizeAsync,
  limitPromiseAll,
  requestWithUrlSwitch,
  sanitizeFileName,
} from "../utils/Utils";
import { Directorys } from "../types";
import { extname, join } from "path";
import sharp from "sharp";
import { Recipe } from "muhammara";
import { AlbumNotExistError, PhotoNotExistError } from "../error";

export class JMAppClient extends JMClientAbstract {
  static APP_VERSION = "1.7.9";
  static APP_TOKEN_SECRET = "18comicAPP";
  static APP_TOKEN_SECRET_2 = "18comicAPPContent";
  static APP_DATA_SECRET = "185Hcomic3PAPP7R";
  /**
   * koishi 配置项
   */
  private config: Config;
  /**
   * koishi 日志
   */
  private logger: Logger;
  /**
   * koishi http
   */
  private http: HTTP;

  constructor(root: string, http: HTTP, config: Config, logger: Logger) {
    super(root);
    this.config = config;
    this.logger = logger;
    this.http = http;
  }

  /**
   * 登录，未完成
   * @param username 用户名
   * @param password 密码
   * @returns 用户信息
   */
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

    const res = await this.http.post<IJMResponse>(
      "https://www.cdnmhws.cc/login",
      formData,
      { headers, responseType: "json" }
    );
    return this.decodeBase64<IJMUser>(res.data, timestamp);
  }

  public async search(keyword: string): Promise<IJMSearchResult> {
    if (this.config.debug) this.logger.info(`搜索本子: ${keyword}`);
    const timestamp = this.getTimeStamp();
    const { token, tokenparam } = this.getTokenAndTokenParam(timestamp);
    const searchRes = await requestWithUrlSwitch(
      "/search",
      "POST",
      {
        params: { search_query: keyword },
        headers: { token, tokenparam },
        responseType: "json",
      },
      this.http,
      this.config,
      this.logger
    );
    return this.decodeBase64<IJMSearchResult>(searchRes.data, timestamp);
  }

  public async getAlbumById(id: string): Promise<JMAppAlbum> {
    if (this.config.debug) this.logger.info(`获取本子(${id})信息`);
    const timestamp = this.getTimeStamp();
    const { token, tokenparam } = this.getTokenAndTokenParam(timestamp);
    const res = await requestWithUrlSwitch(
      "/album",
      "POST",
      {
        params: { id },
        headers: { token, tokenparam },
        responseType: "json",
      },
      this.http,
      this.config,
      this.logger
    );
    const album_json = this.decodeBase64<IJMAlbum>(res.data, timestamp);
    if (!album_json.name) throw new AlbumNotExistError();
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
    if (this.config.debug) this.logger.info(`获取章节(${id})信息`);
    const timestamp = this.getTimeStamp();
    const { token, tokenparam } = this.getTokenAndTokenParam(timestamp);
    const res = await requestWithUrlSwitch(
      "/chapter",
      "POST",
      {
        params: { id },
        headers: { token, tokenparam },
        responseType: "json",
      },
      this.http,
      this.config,
      this.logger
    );
    const photo_json = this.decodeBase64<IJMPhoto>(res.data, timestamp);
    if (!photo_json.name) throw new PhotoNotExistError();
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
    await mkdir(path, { recursive: true });

    const photos: JMAppPhoto[] = album.getPhotos();
    for (const photo of photos) {
      await this.downloadByPhoto(photo, "album", id, photos.length === 1);
    }
  }

  public async downloadByPhoto(
    photo: JMAppPhoto,
    type: "photo" | "album" = "photo",
    albumId: string = "",
    single: boolean = false
  ): Promise<void> {
    const images = photo.getImages();
    const id = photo.getId();
    let path = `${this.root}/${type}/${id}/origin`;
    if (this.config.debug) {
      this.logger.info(`开始下载: ${id}`);
      if (type === "album") {
        this.logger.info(`单章节: ${single ? "是" : "否"}`);
        this.logger.info(`子章节: ${albumId ? "是" : "否"}`);
        this.logger.info(`本子ID: ${albumId}`);
      }
    }
    if (type === "album") {
      if (single) {
        path = `${this.root}/${type}/${albumId}/origin`;
      } else {
        path = `${this.root}/${type}/${albumId}/origin/${id}`;
      }
    }
    if (this.config.debug) this.logger.info(`存储目录：${path}`);
    await mkdir(path, { recursive: true });
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
          const url = `/media/photos/${id}/${image}`;
          if (this.config.debug) this.logger.info(`下载图片：${url}`);

          const res = await requestWithUrlSwitch<ArrayBuffer>(
            url,
            "GET",
            { responseType: "arraybuffer" },
            this.http,
            this.config,
            this.logger,
            "IMAGE"
          );
          await saveImage(res, `${path}/${image}`);
        }),
      this.config.concurrentDownloadLimit
    );
    if (this.config.debug) this.logger.info(`${id} 下载完成，开始解密图片`);
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
    await mkdir(path, { recursive: true });
    await mkdir(decodedPath, { recursive: true });
    await limitPromiseAll(
      images
        // 过滤已经解密的图片
        .filter((image) => {
          const imagePath = `${decodedPath}/${image}`;
          const fileExists = fileExistsAsync(imagePath);
          const fileSize = fileSizeAsync(imagePath);
          return !fileExists || !fileSize;
        })
        .map((image, index) => async () => {
          const imagePath = `${path}/${image}`;
          if (this.config.debug) this.logger.info(`解密图片：${imagePath}`);
          const decodedImagePath = `${decodedPath}/${image}`;
          const imageBuffer = await readFile(imagePath);
          await decodeImage(imageBuffer, splitNumbers[index], decodedImagePath);
        }),
      this.config.concurrentDecodeLimit
    );
    this.logger.info(`${id} 解密完成`);
  }

  public async albumToPdf(
    album: JMAppAlbum,
    password?: string
  ): Promise<string | string[]> {
    // 本子ID
    const id = album.getId();
    const photos = album.getPhotos();
    // 单章节
    if (photos.length === 1) {
      const photo = photos[0];
      return await this.photoToPdf(
        photo,
        `${photo.getName()}`,
        "album",
        id,
        true,
        password
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
          false,
          password
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
    single: boolean = false,
    password?: string
  ): Promise<string> {
    const images = photo.getImages();
    const id = photo.getId();
    if (this.config.debug) this.logger.info(`开始生成PDF ${pdfName}.pdf`);
    pdfName = sanitizeFileName(pdfName);

    let path = join(this.root, type, `${id}`);
    if (type === "album") {
      path = join(this.root, type, `${albumId}`);
    }

    const pdfPath = join(path, `${pdfName}.pdf`);
    let pdfDoc: Recipe;
    // pdf实例
    try {
      pdfDoc = new Recipe("new", pdfPath, {
        version: 1.6,
      });
    } catch (error) {
      throw new Error(error);
    }

    // 临时文件夹
    const tempPath = join(path, `temp_${id}`);
    await mkdir(tempPath);

    // 循环按顺序添加图片
    for (const image of images) {
      let imagePath = join(path, "decoded", image);
      if (type === "album" && !single) {
        imagePath = join(path, "decoded", `${id}`, image);
      }
      // webp 会导致报错，转成jpg
      const buffer = await readFile(imagePath);

      const ext = extname(imagePath);
      // 替换文件扩展名
      const jpgName = image.replace(ext, ".jpg");
      // 完整名称
      const jpgPath = join(tempPath, jpgName);
      // 转换成jpg
      const sharpInstance = sharp(buffer);
      await sharpInstance.jpeg().toFile(jpgPath);

      const metadata = await sharpInstance.metadata();
      pdfDoc
        .createPage(metadata.width, metadata.height)
        .image(jpgPath, 0, 0)
        .endPage();
    }

    // 判断是否需要加密
    if (password) {
      pdfDoc.encrypt({
        userPassword: password,
        ownerPassword: password,
        userProtectionFlag: 4,
      });
    }
    try {
      pdfDoc.endPDF(() => {
        if (this.config.debug) this.logger.info(`PDF ${pdfName}.pdf 生成完成`);
      });
    } catch (error) {
      throw new Error(error);
    } finally {
      await rm(tempPath, { recursive: true });
    }

    return pdfPath;
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
    const path = join(this.root, "album", `${id}`);
    const directorys: Directorys[] = [];
    // 多章节本子
    if (series.length > 1) {
      for (const s of series) {
        directorys.push({
          directory: join(path, "decoded", s.id),
          destpath: `第${s.sort}章`,
        });
      }
    }
    // 单章节本子
    else {
      directorys.push({ directory: join(path, "decoded"), destpath: false });
    }
    const zipPath = join(path, `${zipName}.zip`);
    await archiverImage(directorys, zipPath, password, level);
    if (this.config.debug) this.logger.info(`ZIP ${zipName}.zip 生成完成`);
    return zipPath;
  }

  public async photoToZip(
    photo: JMPhotoAbstract,
    zipName: string,
    password?: string,
    level: number = 6
  ): Promise<string> {
    const id = photo.getId();
    // 文件名合法化
    zipName = sanitizeFileName(zipName);
    const path = join(this.root, "photo", `${id}`);
    const zipPath = join(path, `${zipName}.zip`);
    await archiverImage(
      [{ directory: join(path, "decoded"), destpath: false }],
      zipPath,
      password,
      level
    );
    if (this.config.debug) this.logger.info(`ZIP ${zipName}.zip 生成完成`);
    return zipPath;
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
      { params: { id }, headers: { token, tokenparam }, responseType: "text" },
      this.http,
      this.config,
      this.logger
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
    const token = createHash("md5").update(key).digest("hex");
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
    const decipher = createDecipheriv("aes-256-ecb", key, null);
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
