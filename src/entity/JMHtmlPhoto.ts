import crypto from "crypto";
import * as regexps from "../utils/Regexp";
import { JMPhotoAbstract } from "../abstract/JMPhotoAbstract";

export class JMHtmlPhoto extends JMPhotoAbstract {
  static SCRAMBLE_268850 = 268850;
  static SCRAMBLE_421926 = 421926;

  private scramble_id: number;
  // private photo_html: string;
  private photo_ids: string[];
  private photo_urls: string[];

  constructor(html: string) {
    super();
    // this.photo_html = html;
    this.id = parseInt(html.match(regexps.JM_PHOTO_ID)[1]);
    const scramble_id = parseInt(html.match(regexps.JM_SCRAMBLE_ID)[1]);
    this.scramble_id = scramble_id;

    this.photo_ids = Array.from(
      html.matchAll(regexps.JM_PHOTO_NAME_ID),
      (m) => m[1]
    );

    const matchs_url_name = Array.from(html.matchAll(regexps.JM_PHOTO_URL));
    this.photo_urls = matchs_url_name.map((m) => m[1]);
    this.image_names = matchs_url_name.map((m) => m[2]);
  }

  /**
   * 获取图片分割数
   * @returns {number} 图片分割数
   * @description 根据 scramble_id 和 id 获取图片分割数
   */
  public getSplitNumbers(): number[] {
    // 遍历 photo_names 数组，为每个 name 计算对应的分割数
    return this.photo_ids.map((name) => {
      // 如果 id 小于 scramble_id，则返回分割数为 0
      if (this.id < this.scramble_id) {
        return 0;
      }
      // 如果 id 小于 SCRAMBLE_268850，则返回分割数为 10
      else if (this.id < JMHtmlPhoto.SCRAMBLE_268850) {
        return 10;
      }
      // 根据 id 的范围动态计算分割数
      else {
        // 如果 id 小于 SCRAMBLE_421926，则 x 为 10，否则为 8
        const x = this.id < JMHtmlPhoto.SCRAMBLE_421926 ? 10 : 8;
        // 拼接 id 和 name 生成字符串 s
        const s = `${this.id}${name}`;
        // 创建 md5 哈希对象
        const md5 = crypto.createHash("md5");
        // 计算字符串 s 的 md5 哈希值
        const hash = md5.update(s).digest("hex");
        // 获取哈希值的最后一个字符
        const lastChar = hash[hash.length - 1];
        // 将最后一个字符转换为 ASCII 码并对 x 取模
        let num = lastChar.charCodeAt(0) % x;
        // 计算最终的分割数：num * 2 + 2
        num = num * 2 + 2;
        return num;
      }
    });
  }

  /**
   * 获取JM ID
   * @returns {number} JM ID
   */
  public getId(): number {
    return this.id;
  }

  public getPhotoUrls(): string[] {
    return this.photo_urls;
  }

  public getPhotoIds(): string[] {
    return this.photo_ids;
  }
}
