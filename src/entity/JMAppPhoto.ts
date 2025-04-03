import { JMPhotoAbstract } from "../abstract/JMPhotoAbstract";
import { IJMPhoto } from "../types/JMClient";

export class JMAppPhoto extends JMPhotoAbstract {
  private series: string[];
  private tags: string;
  private name: string;
  private addtime: string;
  private series_id: string;
  private is_favorite: boolean;
  private liked: boolean;

  constructor(json: IJMPhoto) {
    super();
    for (const key in json) {
      if (Object.prototype.hasOwnProperty.call(this, key)) {
        this[key] = json[key];
      }
    }
  }

  public setSeries(series: string[]): void {
    this.series = series;
  }

  public getSeries(): string[] {
    return this.series;
  }

  public setTags(tags: string): void {
    this.tags = tags;
  }

  public getTags(): string {
    return this.tags;
  }

  public setName(name: string): void {
    this.name = name;
  }

  public getName(): string {
    return this.name;
  }

  public setAddtime(addtime: string): void {
    this.addtime = addtime;
  }

  public getAddtime(): string {
    return this.addtime;
  }

  public setSeriesId(seriesId: string): void {
    this.series_id = seriesId;
  }

  public getSeriesId(): string {
    return this.series_id;
  }

  public setIsFavorite(isFavorite: boolean): void {
    this.is_favorite = isFavorite;
  }

  public getIsFavorite(): boolean {
    return this.is_favorite;
  }

  public setLiked(liked: boolean): void {
    this.liked = liked;
  }

  public getLiked(): boolean {
    return this.liked;
  }

  /**
   * 从JSON数据返回JMPhoto实体类
   * @param json JMPhoto JSON数据
   * @returns
   */
  static fromJson(json: IJMPhoto) {
    return new JMAppPhoto(json);
  }
}
