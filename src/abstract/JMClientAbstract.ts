import crypto from "crypto";
import { IJMUser } from "../types/JMClient";
import { JMPhotoAbstract } from "./JMPhotoAbstract";
import { JMAlbumAbstract } from "./JMAlbumAbstract";

export abstract class JMClientAbstract {
  protected root: string;
  protected scramble_id: number;

  constructor(root: string) {
    this.root = root;
  }

  public setRoot(root: string): void {
    this.root = root;
  }

  public getRoot(): string {
    return this.root;
  }

  public setScrambleId(scrambleId: number): void {
    this.scramble_id = scrambleId;
  }

  public getScrambleId(): number {
    return this.scramble_id;
  }

  /**
   * JM登录
   * @param username 用户名
   * @param password 密码
   * @returns JM用户信息
   */
  abstract login(username: string, password: string): Promise<IJMUser>;

  /**
   * 根据本子ID获取本子信息
   * @param id 本子ID
   * @returns JM本子信息
   */
  abstract getAlbumById(id: string): Promise<JMAlbumAbstract>;

  /**
   * 根据章节ID获取章节信息
   * @param id 章节ID
   * @returns JM章节信息
   */
  abstract getPhotoById(id: string): Promise<JMPhotoAbstract>;

  /**
   * 根据本子信息下载
   * @param album 本子
   */
  // abstract downloadByAlbum(album: JMAlbumAbstract): Promise<void>;

  /**
   * 根据章节信息下载
   * @param photo 章节
   */
  abstract downloadByPhoto(photo: JMPhotoAbstract): Promise<void>;

  /**
   * 章节转PDF
   * @param photo 章节
   * @param pdfPath PDF路径
   */
  abstract photoToPdf(photo: JMPhotoAbstract, pdfPath: string): Promise<void>;

  /**
   * 章节转压缩包
   * @param photo 章节
   * @param zipPath 压缩包路径
   */
  abstract photoToZip(
    photo: JMPhotoAbstract,
    zipPath: string,
    password?: string,
    level?: number
  ): Promise<void>;

  /**
   * 解密章节图片
   * @param photo 章节
   */
  abstract decodeByPhoto(photo: JMPhotoAbstract): Promise<void>;

  /**
   * 使用MD5将字符串加密成十六进制
   * @param key 要计算MD5的字符串
   * @returns 十六进制MD5
   */
  public md5Hex(key: string, inputEncoding: crypto.Encoding = "utf-8") {
    return crypto.createHash("md5").update(key, inputEncoding).digest("hex");
  }
}
