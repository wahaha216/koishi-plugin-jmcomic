import { Config } from "..";
import { Logger, HTTP } from "koishi";
import { mkdir, readFile, rm } from "fs/promises";
import { JMClientAbstract } from "../abstract/JMClientAbstract";
import { JMPhotoAbstract } from "../abstract/JMPhotoAbstract";
import { IJMUser } from "../types/JMClient";
import {
  fileExistsAsync,
  fileSizeAsync,
  limitPromiseAll,
  requestWithRetry,
  sanitizeFileName,
} from "../utils/Utils";
import { JMHtmlAlbum } from "./JMHtmlAlbum";
import { JMHtmlPhoto } from "./JMHtmlPhoto";
import { archiverImage, decodeImage, saveImage } from "../utils/Image";
import { join } from "path";
import { Recipe } from "muhammara";
import sharp from "sharp";
import { Directorys } from "../types";

export class JMHtmlClient extends JMClientAbstract {
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

  public async login(username: string, password: string): Promise<IJMUser> {
    const user: IJMUser = {
      uid: "",
      username: "",
      email: "",
      emailverified: "yes",
      photo: "nopic-Male.gif?v=0",
      fname: "",
      gender: "Male",
      message: "",
      coin: "",
      album_favorites: 0,
      s: "",
      level_name: "静默的石头",
      level: 0,
      nextLevelExp: 0,
      exp: "",
      expPercent: 0,
      badges: [],
      album_favorites_max: 0,
      ad_free: false,
      ad_free_before: "",
      charge: "",
      jar: "",
      invitation_qrcode: "",
      invitation_url: "",
      invited_cnt: "",
      jwttoken: "",
    };
    return user;
  }

  public async getAlbumById(id: string): Promise<JMHtmlAlbum> {
    const url = `https://18comic.vip/album/${id}`;
    const html = await requestWithRetry<string>(
      url,
      "GET",
      { responseType: "text" },
      this.http,
      this.config,
      this.logger
    );
    if (html.includes("This album cannot be found.")) {
      throw new Error("Does not exist");
    }
    const album = new JMHtmlAlbum(html);
    let photos: JMHtmlPhoto[] = [];
    const episodes = album.getEpisodes();
    if (episodes.length) {
      for (const { photoId } of episodes) {
        const photo = await this.getPhotoById(photoId);
        photos.push(photo);
      }
    } else {
      const photo = await this.getPhotoById(id);
      photos.push(photo);
    }
    return album;
  }

  public async getPhotoById(id: string): Promise<JMHtmlPhoto> {
    const url = `https://18comic.vip/album/${id}`;
    const html = await requestWithRetry<string>(
      url,
      "GET",
      { responseType: "text" },
      this.http,
      this.config,
      this.logger
    );
    if (html.includes("This album cannot be found.")) {
      throw new Error("Does not exist");
    }
    const photo = new JMHtmlPhoto(html);
    return photo;
  }

  public async downloadByAlbum(album: JMHtmlAlbum): Promise<void> {
    // 本子ID
    const id = album.getId();
    // 本子存放路径
    const path = `${this.root}/album/${id}`;
    // 创建文件夹
    await mkdir(path, { recursive: true });

    const photos: JMHtmlPhoto[] = album.getPhotos();
    for (const photo of photos) {
      await this.downloadByPhoto(photo, "album", id, photos.length === 1);
    }
  }

  public async downloadByPhoto(
    photo: JMHtmlPhoto,
    type: "photo" | "album" = "photo",
    albumId?: string,
    single?: boolean
  ): Promise<void> {
    const id = photo.getId();
    const urls = photo.getPhotoUrls();
    const images = photo.getImages();
    let path = `${this.root}/${type}/${id}/origin`;
    if (type === "album") {
      if (single) {
        path = `${this.root}/${type}/${albumId}/origin`;
      } else {
        path = `${this.root}/${type}/${albumId}/origin/${id}`;
      }
    }
    await mkdir(path, { recursive: true });
    for (let i = 0; i < urls.length; i++) {}
    await limitPromiseAll(
      images
        // 过滤已经下载过的图片
        .filter((image) => {
          const imagePath = `${path}/${image}`;
          const fileExists = fileExistsAsync(imagePath);
          const fileSize = fileSizeAsync(imagePath);
          return !fileExists || !fileSize;
        })
        .map((image, index) => async () => {
          const res = await requestWithRetry<ArrayBuffer>(
            urls[index],
            "GET",
            { responseType: "arraybuffer" },
            this.http,
            this.config,
            this.logger
          );
          await saveImage(res, `${path}/${image}`);
        }),
      this.config.concurrentDownloadLimit
    );
    this.decodeByPhoto(photo);
  }

  public async decodeByPhoto(
    photo: JMHtmlPhoto,
    type: "photo" | "album" = "photo",
    albumId?: string,
    single?: boolean
  ): Promise<void> {
    const images = photo.getImages();
    const id = photo.getId();
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
          // logger.info(`${imagePath}`, `${fileExists}, ${fileSize}, ${!fileExists || !fileSize}`);
          return !fileExists || !fileSize;
        })
        .map((image, index) => async () => {
          const imagePath = `${path}/${image}`;
          this.logger.info(`解密: ${imagePath}`);
          const decodedImagePath = `${decodedPath}/${image}`;
          const imageBuffer = await readFile(imagePath);
          await decodeImage(imageBuffer, splitNumbers[index], decodedImagePath);
        }),
      10
    );
    this.logger.info(`${id} 解密完成`);
  }

  public async albumToPdf(
    album: JMHtmlAlbum,
    password?: string
  ): Promise<string | string[]> {
    // 本子ID
    const id = album.getId();
    const photos = album.getPhotos();
    // 单章节
    if (photos.length === 1) {
      const photo = photos[0];
      return await this.photoToPdf(photo, id, "album", id, true, password);
    }
    // 多章节
    else {
      let paths: string[] = [];
      for (const [i, photo] of photos.entries()) {
        const path = await this.photoToPdf(
          photo,
          `${id}_${i + 1}`,
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

  public async albumToZip(
    album: JMHtmlAlbum,
    password?: string,
    level?: number
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
    this.logger.info(`${zipName}.zip 生成完成`);
    return `${path}/${zipName}.zip`;
  }

  public async photoToPdf(
    photo: JMHtmlPhoto,
    pdfName: string,
    type: "photo" | "album",
    albumId: string,
    single: boolean,
    password?: string
  ): Promise<string> {
    const images = photo.getImages();
    const id = photo.getId();
    this.logger.info(`开始生成PDF ${pdfName}.pdf`);
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

      // 替换文件扩展名
      const jpgName = image.replace(".webp", ".jpg");
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
        this.logger.info(`${pdfName}.pdf 生成完成`);
      });
    } catch (error) {
      throw new Error(error);
    } finally {
      await rm(tempPath, { recursive: true });
    }

    return pdfPath;
  }

  public async photoToZip(
    photo: JMHtmlPhoto,
    zipName: string,
    password?: string,
    level?: number
  ): Promise<string> {
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
    this.logger.info(`${zipName}.zip 生成完成`);
    return `${path}/${zipName}.zip`;
  }
}
