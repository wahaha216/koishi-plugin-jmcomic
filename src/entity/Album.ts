import * as regexp from "../utils/Regexp";
import { Photo } from "./Photo";

export class Album {
  private id: string;
  private jmId: string;
  private scramble_id: number;
  /**
   * 名称
   */
  private name: string;
  /**
   * 章节列表
   */
  private episodes: { name: string; photoId: string }[] = [];
  /**
   * 总页数
   */
  private page_count: number;
  /**
   * 发布时间
   */
  private public_date: string;
  /**
   * 更新时间
   */
  private update_date: string;
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
  private views: string;
  /**
   * 章节详情列表
   */
  private photos: Photo[] = [];

  constructor(html: string) {
    // JM ID
    this.jmId = html.match(regexp.JM_ALBUM_STR_ID)[1];
    // JM 数字ID
    this.id = this.jmId.replace("JM", "");
    this.scramble_id = parseInt(html.match(regexp.JM_SCRAMBLE_ID)[1]);
    // 名称
    let name = html.match(regexp.JM_ALBUM_NAME)[1];
    this.name = name.replaceAll(/\n/g, "").trim();
    // 章节列表
    const episode_div = html.match(regexp.JM_ALBUM_EPISODE_DIV)?.[0];
    if (episode_div) {
      const name_id = episode_div.matchAll(regexp.JM_ALBUM_EPISODE_NAME_ID);
      const name_id_list = Array.from(name_id);
      this.episodes = name_id_list.map((m) => ({ photoId: m[1], name: m[2] }));
    }
    // 总页数
    this.page_count = parseInt(html.match(regexp.JM_ALBUM_PAGE_COUNT)[1]);
    // 发布时间
    this.public_date = html.match(regexp.JM_ALBUM_PUBLIC_DATE)[1];
    // 更新时间
    this.update_date = html.match(regexp.JM_ALBUM_UPDATE_DATE)[1];
    // 标签 tags
    this.tags = this.extractLables(html, regexp.JM_ALBUM_TAGS_SPAN);
    // 作品
    this.works = this.extractLables(html, regexp.JM_ALBUM_WORKS_SPAN);
    // 登场人物
    this.actors = this.extractLables(html, regexp.JM_ALBUM_ACTOR_SPAN);
    // 作者
    this.authors = this.extractLables(html, regexp.JM_ALBUM_AUTHOR_SPAN);
    // 描述
    this.description = html.match(regexp.JM_ALBUM_DESCRIPTION)[1];
    // 喜欢/点赞
    this.likes = html.match(regexp.JM_ALBUM_LIKES)[1];
    // 观看次数
    this.views = html.match(regexp.JM_ALBUM_VIEWS)[1];
  }

  private extractLables(
    html: string,
    sapn_regexp: RegExp,
    a_regexp: RegExp = regexp.JM_ALBUM_TAGS
  ) {
    const span = html.match(sapn_regexp)[0];
    const matches = span.matchAll(a_regexp);
    return Array.from(matches, (m) => m[1]);
  }

  public getId() {
    return this.id;
  }

  public getJMId() {
    return this.jmId;
  }

  public getName() {
    return this.name;
  }

  public getScrambleId() {
    return this.scramble_id;
  }

  public getEpisodes() {
    return this.episodes;
  }

  public addPhoto(photo: Photo) {
    this.photos.push(photo);
  }

  public getPhotos() {
    return this.photos;
  }

  public getPageCount() {
    return this.page_count;
  }

  public getPublicDate() {
    return this.public_date;
  }

  public getUpdateDate() {
    return this.update_date;
  }

  public getWorks() {
    return this.works;
  }

  public getActors() {
    return this.actors;
  }

  public getTags() {
    return this.tags;
  }

  public getAuthor() {
    return this.authors;
  }

  public getDescription() {
    return this.description;
  }

  public getLikes() {
    return this.likes;
  }

  public getViews() {
    return this.views;
  }
}
