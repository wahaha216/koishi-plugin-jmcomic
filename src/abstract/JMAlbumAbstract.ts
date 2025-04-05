import { IJMAlbumSeries } from "../types/JMClient";

export abstract class JMAlbumAbstract {
  /**
   * 本子ID
   */
  private id: string;
  /**
   * 名称
   */
  private name: string;
  /**
   * 章节列表
   */
  private series: IJMAlbumSeries[] = [];
  /**
   * 作品
   */
  private works: string[];
  /**
   * 登场人物
   */
  private actors: string[];
  /**
   * 标签
   */
  private tags: string[];
  /**
   * 作者
   */
  private authors: string[];
  /**
   * 描述
   */
  private description: string;
  /**
   * 点赞数
   */
  private likes: string;
  /**
   * 观看次数
   */
  private total_views: string;

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
}
