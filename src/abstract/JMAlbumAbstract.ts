import { IJMAlbumSeries } from "../types/JMClient";
import { JMPhotoAbstract } from "./JMPhotoAbstract";

export abstract class JMAlbumAbstract {
  /**
   * 本子ID
   */
  protected id: string;
  /**
   * 名称
   */
  protected name: string;
  /**
   * 章节列表
   */
  protected series: IJMAlbumSeries[] = [];
  /**
   * 作品
   */
  protected works: string[];
  /**
   * 登场人物
   */
  protected actors: string[];
  /**
   * 标签
   */
  protected tags: string[];
  /**
   * 作者
   */
  protected authors: string[];
  /**
   * 描述
   */
  protected description: string;
  /**
   * 点赞数
   */
  protected likes: string;
  /**
   * 观看次数
   */
  protected total_views: string;

  /**
   * 章节信息
   */
  protected photos: JMPhotoAbstract[];

  public setId(id: string): void {
    this.id = id;
  }

  public getId(): string {
    return this.id;
  }

  public setName(name: string): void {
    this.name = name;
  }

  public getName(): string {
    return this.name;
  }

  public setSeries(series: IJMAlbumSeries[]): void {
    this.series = series;
  }

  public getSeries(): IJMAlbumSeries[] {
    return this.series;
  }

  public setWorks(works: string[]): void {
    this.works = works;
  }

  public getWorks(): string[] {
    return this.works;
  }

  public setActors(actors: string[]): void {
    this.actors = actors;
  }

  public getActors(): string[] {
    return this.actors;
  }

  public setTags(tags: string[]): void {
    this.tags = tags;
  }

  public getTags(): string[] {
    return this.tags;
  }

  public setAuthors(authors: string[]): void {
    this.authors = authors;
  }

  public getAuthors(): string[] {
    return this.authors;
  }

  public setDescription(description: string): void {
    this.description = description;
  }

  public getDescription(): string {
    return this.description;
  }

  public setLikes(likes: string): void {
    this.likes = likes;
  }

  public getLikes(): string {
    return this.likes;
  }

  public setTotalViews(totalViews: string): void {
    this.total_views = totalViews;
  }

  public getTotalViews(): string {
    return this.total_views;
  }

  public setPhotos(photos: JMPhotoAbstract[]) {
    this.photos = photos;
  }

  public getPhotos(): JMPhotoAbstract[] {
    return this.photos;
  }
}
