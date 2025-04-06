import { JMAlbumAbstract } from "../abstract/JMAlbumAbstract";
import { IJMAlbum, IJMAlbumRelated } from "../types/JMClient";
import { JMAppPhoto } from "./JMAppPhoto";

export class JMAppAlbum extends JMAlbumAbstract {
  private images: string[];
  private addtime: string;
  private series_id: string;
  private comment_total: string;
  private related_list: IJMAlbumRelated[];
  private liked: boolean;
  private is_favorite: boolean;
  private is_aids: boolean;
  private price: string;
  private purchased: string;

  constructor(json: IJMAlbum) {
    super();
    for (const key in json) {
      if (Object.prototype.hasOwnProperty.call(this, key)) {
        this[key] = json[key];
      }
    }
  }

  public setImages(images: string[]): void {
    this.images = images;
  }

  public getImages(): string[] {
    return this.images;
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

  public setCommentTotal(commentTotal: string): void {
    this.comment_total = commentTotal;
  }

  public getCommentTotal(): string {
    return this.comment_total;
  }

  public setRelatedList(relatedList: IJMAlbumRelated[]): void {
    this.related_list = relatedList;
  }

  public getRelatedList(): IJMAlbumRelated[] {
    return this.related_list;
  }

  public setLiked(liked: boolean): void {
    this.liked = liked;
  }

  public getLiked(): boolean {
    return this.liked;
  }

  public setIsFavorite(isFavorite: boolean): void {
    this.is_favorite = isFavorite;
  }

  public getIsFavorite(): boolean {
    return this.is_favorite;
  }

  public setIsAids(isAids: boolean): void {
    this.is_aids = isAids;
  }

  public getIsAids(): boolean {
    return this.is_aids;
  }

  public setPrice(price: string): void {
    this.price = price;
  }

  public getPrice(): string {
    return this.price;
  }

  public setPurchased(purchased: string): void {
    this.purchased = purchased;
  }

  public getPurchased(): string {
    return this.purchased;
  }

  public getPhotos(): JMAppPhoto[] {
    return super.getPhotos() as JMAppPhoto[];
  }

  static fromJson(json: IJMAlbum) {
    return new JMAppAlbum(json);
  }
}
