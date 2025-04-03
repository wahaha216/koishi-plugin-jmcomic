import crypto from "crypto";

export abstract class JMPhotoAbstract {
  static SCRAMBLE_268850 = 268850;
  static SCRAMBLE_421926 = 421926;

  protected id: number;
  protected images: string[];
  protected image_names: string[];
  protected splitNumbers: number[];

  public setId(id: number): void {
    this.id = id;
  }

  public getId(): number {
    return this.id;
  }

  public setImages(images: string[]): void {
    this.images = images;
  }

  public getImages(): string[] {
    return this.images;
  }

  public setImageNames(imageNames: string[]): void {
    this.image_names = imageNames;
  }

  public getImageNames(): string[] {
    return this.image_names;
  }

  public setSplitNumbers(splitNumbers: number[]): void {
    this.splitNumbers = splitNumbers;
  }

  public getSplitNumbers(): number[] {
    return this.splitNumbers;
  }

  /**
   * 生成图片分割数
   */
  public generateSplitNumbers(scramble_id: number) {
    // 遍历 photo_names 数组，为每个 name 计算对应的分割数
    const splitNumbers = this.image_names.map((name) => {
      // 如果 id 小于 scramble_id，则返回分割数为 0
      if (this.id < scramble_id) {
        return 0;
      }
      // 如果 id 小于 SCRAMBLE_268850，则返回分割数为 10
      else if (this.id < JMPhotoAbstract.SCRAMBLE_268850) {
        return 10;
      }
      // 根据 id 的范围动态计算分割数
      else {
        // 如果 id 小于 SCRAMBLE_421926，则 x 为 10，否则为 8
        const x = this.id < JMPhotoAbstract.SCRAMBLE_421926 ? 10 : 8;
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
    this.splitNumbers = splitNumbers;
  }
}
