import {
  IJMBlogInfo,
  IJMBlogRelatedBlog,
  IJMBlogRelatedComics,
} from "../types/JMClient";

export abstract class JMBlogAbstract {
  /**
   * 文库信息
   */
  protected info: IJMBlogInfo;
  /**
   * 关联的本子
   */
  protected related_comics: IJMBlogRelatedComics[];
  /**
   * 相关文库
   */
  protected related_blogs: IJMBlogRelatedBlog[];

  // --- Info 的 Getter 和 Setter ---
  public get Info(): IJMBlogInfo {
    return this.info;
  }
  public set Info(value: IJMBlogInfo) {
    this.info = value;
  }

  // --- RelatedComics 的 Getter 和 Setter ---
  public get RelatedComics(): IJMBlogRelatedComics[] {
    return this.related_comics;
  }
  public set RelatedComics(value: IJMBlogRelatedComics[]) {
    this.related_comics = value;
  }

  // --- RelatedBlogs 的 Getter 和 Setter ---
  public get RelatedBlogs(): IJMBlogRelatedBlog[] {
    return this.related_blogs;
  }
  public set RelatedBlogs(value: IJMBlogRelatedBlog[]) {
    this.related_blogs = value;
  }
}
